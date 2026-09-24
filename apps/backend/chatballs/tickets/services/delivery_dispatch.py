"""Оркестратор конвейера доставок уведомлений по заявкам."""

from __future__ import annotations

import logging

from django.db import IntegrityError, transaction

from chatballs.events.services import DomainEvent, enqueue_event
from chatballs.tenancy.context import TenantContext
from chatballs.tickets.models.activities import TicketEvent, TicketEventType
from chatballs.tickets.models.delivery import (
    CustomerNoticePolicy,
    TicketDelivery,
    TicketDeliveryStatus,
    compute_destination_hash,
)
from chatballs.tickets.models.ticket import Ticket
from chatballs.tickets.realtime import notify_tickets_inbox_changed
from chatballs.tickets.services.customer_notifications import (
    resolve_customer_delivery_target,
)
from chatballs.tickets.services.staff_notifications import (
    enqueue_staff_notification,
)

logger = logging.getLogger(__name__)

EVENT_TYPE_DELIVERY_DISPATCHED = "tickets.delivery_dispatched"


def dispatch_ticket_event(
    ticket: Ticket,
    event: TicketEvent,
    *,
    customer_notice: str = CustomerNoticePolicy.SEND,
    suppression_reason: str = "",
    context: TenantContext | None = None,
) -> TicketDelivery | None:
    """Оркестрация уведомлений при возникновении события заявки.

    1. Создает запись TicketDelivery для клиента, если требуется.
    2. Ставит событие tickets.delivery_dispatched в Outbox.
    3. Ставит событие tickets.staff_notification в Outbox.
    4. Отправляет realtime-сигнал tickets.inbox.changed.
    """
    # 1. Realtime-сигнализация в сокет организации
    notify_tickets_inbox_changed(ticket.organization_id)

    # 2. Внутренние уведомления сотрудникам (не зависят от клиентского подавления)
    enqueue_staff_notification(ticket, event, context=context)

    # 3. Клиентская доставка
    if not should_deliver_to_customer(event):
        return None

    delivery = create_customer_delivery(
        ticket=ticket,
        event=event,
        customer_notice=customer_notice,
        suppression_reason=suppression_reason,
    )

    if delivery is not None:
        enqueue_event(
            DomainEvent(
                aggregate_type="TicketDelivery",
                aggregate_id=str(delivery.id),
                event_type=EVENT_TYPE_DELIVERY_DISPATCHED,
                payload={
                    "delivery_id": delivery.id,
                    "ticket_id": ticket.id,
                    "event_id": event.id,
                },
                tenant_context=context,
            )
        )

    return delivery


def should_deliver_to_customer(event: TicketEvent) -> bool:
    """Проверка, является ли событие основанием для клиентского уведомления."""
    if event.event_type == TicketEventType.STATUS_CHANGED:
        return True
    if event.event_type == TicketEventType.COMMENT_ADDED:
        # Уведомляем клиента только если комментарий публичный и оставлен сотрудником/системой
        return bool(event.new_values.get("is_public", True)) and not event.actor_contact_id
    if event.event_type in (TicketEventType.CREATED, TicketEventType.CREATED_FROM_CONVERSATION):
        return True
    return False


def create_customer_delivery(
    ticket: Ticket,
    event: TicketEvent,
    *,
    customer_notice: str,
    suppression_reason: str = "",
) -> TicketDelivery | None:
    """Создание записи TicketDelivery с дедупликацией по уникальному ключу."""
    if customer_notice == CustomerNoticePolicy.NOT_REQUIRED:
        return None

    target = resolve_customer_delivery_target(ticket)
    if target is None:
        return None

    channel, destination, _ = target
    dest_hash = compute_destination_hash(channel, destination)

    status = (
        TicketDeliveryStatus.SUPPRESSED
        if customer_notice == CustomerNoticePolicy.SUPPRESS
        else TicketDeliveryStatus.PENDING
    )

    try:
        with transaction.atomic():
            delivery = TicketDelivery.objects.create(
                organization=ticket.organization,
                ticket=ticket,
                event=event,
                channel=channel,
                destination=destination,
                destination_key_hash=dest_hash,
                status=status,
                customer_notice=customer_notice,
                suppression_reason=suppression_reason,
            )
            return delivery
    except IntegrityError:
        # Защита от дубликатов по (event, destination_key_hash)
        logger.info(
            "TicketDelivery duplicate suppressed for event %s, destination hash %s",
            event.id,
            dest_hash,
        )
        return TicketDelivery.objects.filter(
            event=event, destination_key_hash=dest_hash
        ).first()
