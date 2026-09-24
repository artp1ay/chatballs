"""Приём входящих из подключений (M2a).

Одно входящее -> контакт/диалог/сообщение -> заявка на ход AI, если диалог
ведёт агент. Повторы отсекаются через InboxEvent.

Обращений наружу здесь нет и быть не должно: приём вызывают цикл опроса
мессенджеров и HTTP-запрос виджета, и ждать провайдера ни тот, ни другой не
может. Ответ считает роль событий (chatballs.conversations.ai_turn).
"""

from __future__ import annotations

import hashlib
import logging

from django.db import IntegrityError, transaction
from django.utils import timezone

from chatballs.channels.models import RuleActionTarget
from chatballs.channels.rules.ingest import route_inbound_conversation
from chatballs.conversations import transports
from chatballs.conversations.ai_turn import request_ai_turn
from chatballs.conversations.contact_avatars import refresh_contact_avatar
from chatballs.conversations.inbound_media import store_attachment, store_voice
from chatballs.conversations.inbound_notifications import (
    notify_media_operator,
    notify_new_dialog,
    notify_new_message,
)
from chatballs.conversations.models import (
    ConnectionIdentity,
    Contact,
    ControlMode,
    Conversation,
    ExpectedResponder,
    LifecycleState,
    Message,
    MessageAuthor,
    MessageKind,
)
from chatballs.conversations.queue import QUEUE_FIELDS, enter_queue
from chatballs.conversations.transports.base import InboundMessage
from chatballs.events.models import EventOwnership, InboxEvent
from chatballs.tenancy.context import TenantContext

logger = logging.getLogger(__name__)


def _already_processed(context: TenantContext, source: str, external_id: str, text: str) -> bool:
    """Отметить сообщение обработанным; True — оно уже приходило.

    Вставка идёт своей точкой сохранения. Вызывают эту функцию изнутри
    транзакции (воркер держит ``tenant_atomic`` на весь цикл поллинга), а
    IntegrityError в Postgres обрывает транзакцию целиком: без savepoint
    первый же повтор сообщения ронял не дедупликацию, а весь цикл — со всеми
    остальными подключениями организации.
    """
    payload_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()[:32]
    try:
        with transaction.atomic():
            InboxEvent.objects.create(
                source=source,
                external_event_id=external_id,
                payload_hash=payload_hash,
                ownership=EventOwnership.TENANT,
                organization=context.organization,
            )
        return False
    except IntegrityError:
        return True


def ingest_inbound(integration, inbound: InboundMessage) -> None:
    channel = integration.channel
    if channel is None:
        logger.warning("Integration %s has no channel — inbound dropped", integration.id)
        return
    context = TenantContext.for_resource(channel.organization)
    agent = getattr(channel, "ai_agent", None)
    ai_available = bool(agent and agent.is_active)
    source = f"{integration.provider.lower()}:{integration.id}"
    if _already_processed(context, source, inbound.external_id, inbound.text):
        return
    received_at = timezone.now()

    # Явный шаринг контакта: сообщение без текста, но с телефоном.
    is_contact_share = bool(inbound.phone)
    is_voice = bool(
        inbound.voice_file_id
        or inbound.voice_url
        or inbound.voice_content
        or inbound.voice_unavailable
    )
    files = tuple(inbound.files or ())
    # Файлы без текста: сообщение-контейнер не создаём, каждый файл — своя реплика.
    files_only = bool(files) and not inbound.text and not is_contact_share and not is_voice
    message_text = inbound.text or (
        f"Поделился контактом: {inbound.phone}" if is_contact_share else ""
    ) or ("Голосовое сообщение" if is_voice else "") or (
        ("Фото" if files[0].is_image else f"Файл: {files[0].name}") if files else ""
    )

    with transaction.atomic():
        identity = (
            ConnectionIdentity.objects.select_related("contact")
            .filter(connection=integration, external_user_id=inbound.user_id)
            .first()
        )
        if identity is None:
            contact = Contact.objects.create(
                organization=channel.organization,
                name=inbound.display_name,
                avatar_url=inbound.avatar_url,
            )
            identity = ConnectionIdentity.objects.create(
                contact=contact,
                connection=integration,
                external_user_id=inbound.user_id,
                display_name=inbound.display_name,
                username=inbound.username,
            )
        elif inbound.username and identity.username != inbound.username:
            identity.username = inbound.username
            identity.save(update_fields=["username"])
        contact = identity.contact
        if is_contact_share and inbound.phone:
            if contact.phone != inbound.phone:
                contact.phone = inbound.phone
                contact.save(update_fields=["phone"])
            # Телефон подтвердило именно это подключение (ADR-CHATBALLS-0006).
            if identity.phone_verified_at is None:
                identity.phone_verified_at = timezone.now()
                identity.save(update_fields=["phone_verified_at"])
        # Адрес фото у провайдера храним как было, но показываем оператору не
        # его: страница под CSP `img-src 'self'` чужую картинку не покажет.
        if inbound.avatar_url and contact.avatar_url != inbound.avatar_url:
            contact.avatar_url = inbound.avatar_url
            contact.save(update_fields=["avatar_url"])
        refresh_contact_avatar(integration, inbound, contact)

        conversation = (
            Conversation.objects.filter(channel=channel, contact=contact, lifecycle=LifecycleState.OPEN)
            .order_by("-last_activity_at")
            .first()
        )
        is_new = conversation is None
        previous = None
        if conversation is None:
            # ADR-CHATBALLS-0002: новое сообщение после закрытия создаёт новый диалог,
            # связанный с предыдущим для навигации по истории.
            previous = Conversation.objects.filter(channel=channel, contact=contact).order_by("-created_at").first()
            conversation = Conversation.objects.create(
                organization=channel.organization,
                channel=channel,
                # Диалог наследует группу канала при создании (ADR-CHATBALLS-0043 §3).
                group=channel.group,
                connection=integration,
                contact=contact,
                external_chat_id=inbound.chat_id,
                control_mode=ControlMode.PAUSED,
                expected_responder=ExpectedResponder.OPERATOR,
                waiting_since=received_at,
                previous_conversation=previous,
            )
        elif inbound.chat_id and not conversation.external_chat_id:
            conversation.external_chat_id = inbound.chat_id

        is_first_message = not Message.objects.filter(
            conversation__contact=contact,
            author_type=MessageAuthor.CONTACT,
        ).exists()
        # Для обычного сообщения этот флаг вычисляется до create(), поэтому
        # текущая реплика не превращает первый контакт в последующий.
        if not files_only:
            message = Message.objects.create(
                conversation=conversation,
                author_type=MessageAuthor.CONTACT,
                kind=(
                    MessageKind.CONTACT
                    if is_contact_share
                    else MessageKind.VOICE
                    if is_voice
                    else MessageKind.TEXT
                ),
                text="" if is_voice else message_text,
                content_html=inbound.content_html,
                external_id=inbound.external_id,
            )
            if is_voice:
                store_voice(integration, inbound, message)
        for index, inbound_file in enumerate(files):
            file_message = Message.objects.create(
                conversation=conversation,
                author_type=MessageAuthor.CONTACT,
                kind=MessageKind.FILE,
                external_id=f"{inbound.external_id}:file:{index}" if not files_only or index else inbound.external_id,
            )
            store_attachment(integration, inbound_file, file_message)
        has_verified_phone = identity.phone_verified_at is not None or (
            ConnectionIdentity.objects.filter(
                contact=contact,
                phone_verified_at__isnull=False,
            ).exists()
        )
        routing_decision = route_inbound_conversation(
            channel=channel,
            contact=contact,
            conversation=conversation,
            inbound_message_text=message_text,
            is_new_conversation=is_new,
            is_first_message=is_first_message,
            has_verified_phone=has_verified_phone,
            has_active_ai_agent=ai_available,
            current_time=received_at,
        )
        conversation.last_activity_at = received_at
        update_fields = ["external_chat_id", "last_activity_at"]
        if inbound.thread_meta:
            # Email: Message-ID последнего входящего — для ответа в тред;
            # тема диалога фиксируется по первому письму (ADR-CHATBALLS-0035).
            current = conversation.transport_meta or {}
            conversation.transport_meta = {
                **current,
                **inbound.thread_meta,
                "subject": current.get("subject") or inbound.thread_meta.get("subject", ""),
            }
            update_fields.append("transport_meta")
        conversation.save(update_fields=update_fields)

    if (
        routing_decision is not None
        and routing_decision.target == RuleActionTarget.DROP_SILENTLY
    ):
        return

    # Файлы без текста: отвечать не на что — диалог уходит оператору, как при
    # недоступном AI, но без имитации сбоя. Голосовое сюда не попадает: его
    # расшифровка — это обращение к провайдеру, и оно идёт ходом AI.
    if files_only:
        if conversation.control_mode == ControlMode.AI:
            enter_queue(conversation)
            conversation.save(update_fields=QUEUE_FIELDS)
        notify_media_operator(
            context=context,
            contact=contact,
            conversation=conversation,
            message_text=message_text,
        )
        return

    if is_new:
        notify_new_dialog(
            context=context,
            channel=channel,
            contact=contact,
            integration=integration,
            conversation=conversation,
            message_text=message_text,
        )
    elif conversation.control_mode != ControlMode.AI:
        notify_new_message(
            context=context,
            contact=contact,
            integration=integration,
            conversation=conversation,
            external_id=inbound.external_id,
            message_text=message_text,
        )

    # Полученный контакт: телефон сохранён — подтверждаем (в TG заодно убираем
    # reply-клавиатуру) и не запускаем AI-ход: отвечать не на что.
    if is_contact_share:
        ack = "Спасибо! Контакт получен."
        Message.objects.create(conversation=conversation, author_type=MessageAuthor.AI, text=ack)
        conversation.expected_responder = ExpectedResponder.CUSTOMER if conversation.control_mode == ControlMode.AI else conversation.expected_responder
        conversation.save(update_fields=["expected_responder"])
        transports.send_contact_ack(integration, chat_id=conversation.external_chat_id, user_id=inbound.user_id, text=ack)
        return

    # Операторский канал без активного агента сразу создаёт очередь и не
    # имитирует сбой AI перед клиентом.
    if conversation.control_mode != ControlMode.AI:
        return

    # Ход AI — отдельная работа: обращение к модели ждёт ответа секунды и
    # десятки секунд, а приём входящих столько ждать не может. Здесь только
    # заявка; считает ход роль событий (chatballs.conversations.ai_turn).
    request_ai_turn(
        message=message,
        user_id=inbound.user_id,
        context=context,
        is_new_conversation=is_new,
    )
