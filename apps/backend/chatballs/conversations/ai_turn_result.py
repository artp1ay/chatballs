"""Что делать с результатом хода AI: ответ клиенту либо передача оператору.

Отделено от оркестрации (chatballs.conversations.ai_turn) намеренно: там —
порядок шагов и границы транзакций, здесь — правила диалога. Функции записи
вызывают внутри транзакции и возвращают текст, который нужно отправить
клиенту: сама отправка — это сеть, и её место снаружи транзакции.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from django.utils import timezone

from chatballs.ai.runtime import HANDOFF_TOKEN
from chatballs.conversations.models import (
    AiTurnState,
    ControlMode,
    Conversation,
    ExpectedResponder,
    LifecycleState,
    Message,
    MessageAuthor,
    SystemEvent,
)
from chatballs.conversations.queue import QUEUE_FIELDS, enter_queue
from chatballs.i18n import customer_language, t
from chatballs.notifications.models import NotificationAudience, NotificationType
from chatballs.notifications.services import notify, notify_management
from chatballs.tenancy.context import TenantContext

if TYPE_CHECKING:  # pragma: no cover - только для подсказок типов
    from chatballs.conversations.ai_turn import Turn

logger = logging.getLogger(__name__)


def _finish(message: Message, state: str) -> None:
    message.ai_turn_state = state
    message.save(update_fields=["ai_turn_state"])


def _contact_name(turn: Turn) -> str:
    return turn.conversation.contact.name or t("conversations.guest")


def _lock_turn_rows(
    *, message_id: int, conversation_id: int, context: TenantContext
) -> tuple[Conversation, Message] | None:
    conversation = (
        Conversation.objects.select_for_update()
        .filter(pk=conversation_id, organization_id=context.organization_id)
        .first()
    )
    if conversation is None:
        return None

    message = (
        Message.objects.select_for_update()
        .filter(
            pk=message_id,
            conversation_id=conversation.id,
            organization_id=context.organization_id,
        )
        .first()
    )
    if message is None:
        return None
    return conversation, message


def lock_turn_for_start(
    *, message_id: int, context: TenantContext
) -> tuple[Conversation, Message] | None:
    """Заблокировать диалог и входящее сообщение перед запуском хода."""

    message_ref = (
        Message.objects.filter(id=message_id)
        .values("conversation_id")
        .first()
    )
    if message_ref is None:
        return None
    return _lock_turn_rows(
        message_id=message_id,
        conversation_id=message_ref["conversation_id"],
        context=context,
    )


def _lock_active_turn(*, turn: Turn, context: TenantContext) -> bool:
    """Перечитать и заблокировать ход перед записью результата.

    Снимок ``turn`` сделан до обращения к модели, поэтому после него нельзя
    принимать решение по старому диалогу. Блокировка диалога и сообщения делает
    проверку и запись одной атомарной операцией: перехват оператора либо ждёт
    финализацию, либо отменяет её.
    """

    locked = _lock_turn_rows(
        message_id=turn.message.pk,
        conversation_id=turn.conversation.pk,
        context=context,
    )
    if locked is None:
        return False
    conversation, message = locked

    if (
        conversation.lifecycle != LifecycleState.OPEN
        or conversation.control_mode != ControlMode.AI
        or message.ai_turn_state != AiTurnState.RUNNING
    ):
        # Перехват мог завершить ход сам. Не трогаем состояние диалога: оператор
        # уже выставил HUMAN, PAUSED или другую маршрутизацию.
        if message.ai_turn_state in (AiTurnState.PENDING, AiTurnState.RUNNING):
            _finish(message, AiTurnState.DONE)
        logger.info(
            "Устаревший результат AI для сообщения %s (режим=%s, ход=%s)",
            message.id,
            conversation.control_mode,
            message.ai_turn_state,
        )
        return False

    # Все последующие записи используют уже заблокированные актуальные строки,
    # а не снимок, оставшийся после внешнего вызова.
    turn.conversation = conversation
    turn.message = message
    return True


def store_answer(*, turn: Turn, context: TenantContext, text: str) -> str | None:
    """Ответ модели: запись в диалог и, если модель попросила, передача оператору.

    ``None`` означает, что результат устарел: диалог уже не ведёт AI или ход
    завершён. В таком случае не меняются сообщения, очередь и режим диалога.
    """
    if not _lock_active_turn(turn=turn, context=context):
        return None

    conversation = turn.conversation
    reply = text
    handoff = HANDOFF_TOKEN in reply
    if handoff:
        reply = reply.replace(HANDOFF_TOKEN, "").strip()

    Message.objects.create(conversation=conversation, author_type=MessageAuthor.AI, text=reply)
    conversation.last_activity_at = timezone.now()
    if handoff:
        enter_queue(conversation)
    else:
        conversation.expected_responder = ExpectedResponder.CUSTOMER
    conversation.save(update_fields=[*QUEUE_FIELDS, "last_activity_at"])
    _finish(turn.message, AiTurnState.DONE)

    if handoff:
        Message.objects.create(
            conversation=conversation,
            author_type=MessageAuthor.SYSTEM,
            system_event=SystemEvent.AI_HANDED_OVER,
            text="AI передал диалог оператору",
        )
        notify(
            context=context,
            type=NotificationType.OPERATOR_REQUESTED,
            audience=NotificationAudience.OPERATORS,
            audience_group=conversation.group,
            title=f"AI передал диалог · {_contact_name(turn)}",
            title_key="notifications.ai_handed_over",
            text_params={"contact": _contact_name(turn)},
            body=turn.query[:120],
            target_id=conversation.id,
            source_type="Conversation",
            source_id=conversation.id,
            dedup_key=f"handoff:{conversation.id}",
        )
    return reply


def store_voice_without_transcript(*, turn: Turn, context: TenantContext) -> None:
    """Отвечать не на что: голосовое без стенограммы уходит оператору.

    Это не сбой AI, и клиент не должен видеть извинений за поломку: ему просто
    ответит человек. Если оператор уже перехватил диалог, состояние хода только
    закрывается, без изменения очереди.
    """
    if not _lock_active_turn(turn=turn, context=context):
        return

    conversation = turn.conversation
    enter_queue(conversation)
    conversation.save(update_fields=QUEUE_FIELDS)
    _finish(turn.message, AiTurnState.FAILED)
    if turn.is_new_conversation:
        # Про новый диалог операторов уже позвали при приёме.
        return
    notify(
        context=context,
        type=NotificationType.OPERATOR_REQUESTED,
        audience=NotificationAudience.OPERATORS,
        audience_group=conversation.group,
        title=f"Нужен оператор · {_contact_name(turn)}",
        title_key="notifications.operator_needed",
        text_params={"contact": _contact_name(turn)},
        body="Голосовое без расшифровки",
        body_key="notifications.voice_without_transcript",
        target_id=conversation.id,
        source_type="Conversation",
        source_id=conversation.id,
        dedup_key=f"media:{conversation.id}",
    )


def store_failure(*, turn: Turn, context: TenantContext, error: object) -> str | None:
    """Ответа не будет: диалог уходит оператору, клиент получает понятный текст.

    Сбой AI не должен «терять» сообщение — ни отказ провайдера, ни ход,
    просроченный в очереди. ``None`` означает устаревший результат, который
    уже нельзя показывать клиенту или записывать в перехваченный диалог.
    """
    if not _lock_active_turn(turn=turn, context=context):
        return None

    conversation = turn.conversation
    channel = conversation.channel
    logger.warning("AI turn failed for conversation %s: %s", conversation.id, error)

    enter_queue(conversation)
    conversation.last_activity_at = timezone.now()
    conversation.save(update_fields=[*QUEUE_FIELDS, "last_activity_at"])
    Message.objects.create(
        conversation=conversation,
        author_type=MessageAuthor.SYSTEM,
        system_event=SystemEvent.AI_UNAVAILABLE,
        text="AI недоступен — диалог передан оператору",
    )
    fallback = t(
        "conversations.ai_unavailable_reply",
        language=customer_language(channel.organization),
    )
    Message.objects.create(
        conversation=conversation, author_type=MessageAuthor.AI, text=fallback
    )
    _finish(turn.message, AiTurnState.FAILED)

    notify(
        context=context,
        type=NotificationType.OPERATOR_REQUESTED,
        audience=NotificationAudience.OPERATORS,
        audience_group=conversation.group,
        title=f"Нужен оператор · {_contact_name(turn)}",
        title_key="notifications.operator_needed",
        text_params={"contact": _contact_name(turn)},
        body="AI временно недоступен, диалог ждёт ответа",
        body_key="notifications.ai_unavailable_waiting",
        target_id=conversation.id,
        source_type="Conversation",
        source_id=conversation.id,
        dedup_key=f"aifail:{conversation.id}",
    )
    notify_management(
        context=context,
        type=NotificationType.AI_STOPPED,
        title=f"Ошибка AI · {channel.name}",
        body="AI временно недоступен, диалог передан оператору",
        title_key="notifications.ai_error",
        body_key="notifications.ai_unavailable_handed_over",
        text_params={"channel": channel.name},
        target_id=conversation.id,
        source_type="Conversation",
        source_id=conversation.id,
        dedup_key=f"aierror:{conversation.id}",
    )
    return fallback
