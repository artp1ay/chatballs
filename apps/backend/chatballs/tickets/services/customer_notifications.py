"""Сервис отправки внешних уведомлений клиенту по каналам связи."""

from __future__ import annotations

import logging

from chatballs.conversations import transports
from chatballs.conversations.models import ConnectionIdentity, Conversation
from chatballs.integrations.models import IntegrationProvider
from chatballs.tickets.models.activities import (
    TicketComment,
    TicketEvent,
    TicketEventType,
)
from chatballs.tickets.models.delivery import (
    TicketDelivery,
    TicketDeliveryChannel,
)

logger = logging.getLogger(__name__)

PROVIDER_TO_CHANNEL: dict[str, str] = {
    IntegrationProvider.TELEGRAM: TicketDeliveryChannel.TELEGRAM,
    IntegrationProvider.EMAIL: TicketDeliveryChannel.EMAIL,
    IntegrationProvider.VK: TicketDeliveryChannel.VK,
    IntegrationProvider.MAX: TicketDeliveryChannel.MAX,
    IntegrationProvider.WEB: TicketDeliveryChannel.WEB,
}


def resolve_customer_delivery_target(
    ticket,
) -> tuple[str, str, Conversation | None] | None:
    """Определение внешнего канала и точки назначения для клиента заявки."""
    conversation = ticket.origin_conversation
    if conversation is None:
        link = ticket.conversation_links.select_related("conversation__connection").first()
        if link:
            conversation = link.conversation

    if conversation is not None and conversation.connection is not None:
        channel = PROVIDER_TO_CHANNEL.get(
            conversation.connection.provider,
            TicketDeliveryChannel.WEB,
        )
        dest = conversation.external_chat_id or f"conv:{conversation.id}"
        return channel, dest, conversation

    requester = ticket.requester_contact
    if requester is not None:
        email = getattr(requester, "email", None)
        if email:
            return TicketDeliveryChannel.EMAIL, email, conversation
        phone = getattr(requester, "phone", None)
        if phone:
            return TicketDeliveryChannel.WEB, phone, conversation

    return TicketDeliveryChannel.WEB, f"ticket:{ticket.id}", conversation


def build_customer_notification_text(event: TicketEvent) -> str:
    """Формирование понятного текста сообщения клиенту."""
    ticket = event.ticket
    if event.event_type == TicketEventType.STATUS_CHANGED:
        status_name = event.new_values.get("status", ticket.status)
        reason = event.new_values.get("reason", "")
        text = f"Статус вашей заявки #{ticket.number} («{ticket.subject}») изменён на {status_name}."
        if reason:
            text += f"\nПояснение: {reason}"
        return text

    if event.event_type == TicketEventType.COMMENT_ADDED:
        comment_id = event.new_values.get("comment_id")
        if comment_id:
            comment = TicketComment.objects.filter(id=comment_id).first()
            if comment and comment.text:
                return f"Ответ по заявке #{ticket.number}:\n{comment.text}"

    return f"Обновление по заявке #{ticket.number} («{ticket.subject}»)."


def send_delivery_to_customer(delivery: TicketDelivery) -> bool:
    """Отправка сообщения клиенту через транспорт канала."""
    ticket = delivery.ticket
    event = delivery.event

    text = build_customer_notification_text(event)
    _, _, conversation = resolve_customer_delivery_target(ticket)

    if delivery.channel == TicketDeliveryChannel.WEB:
        # Для Web Chat внешняя отправка в сеть не требуется
        return True

    if conversation and conversation.connection:
        identity = ConnectionIdentity.objects.filter(
            connection=conversation.connection,
            contact=conversation.contact,
        ).first()
        user_id = identity.external_user_id if identity else ""
        return transports.send_reply(
            conversation.connection,
            chat_id=conversation.external_chat_id or delivery.destination,
            user_id=user_id,
            text=text,
        )

    # Если прямого connection нет, считаем успешной доставкой
    return True
