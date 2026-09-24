"""Обработчики транзакционных событий Outbox для модуля заявок."""

from __future__ import annotations

import logging
from typing import Any

from django.utils import timezone

from chatballs.events.handlers import register
from chatballs.tenancy.context import TenantContext
from chatballs.tenancy.database import tenant_atomic
from chatballs.tickets.models.delivery import (
    CustomerNoticePolicy,
    TicketDelivery,
    TicketDeliveryStatus,
)
from chatballs.tickets.services import customer_notifications
from chatballs.tickets.services.delivery_dispatch import (
    EVENT_TYPE_DELIVERY_DISPATCHED,
)
from chatballs.tickets.services.staff_notifications import (
    EVENT_TYPE_STAFF_NOTIFICATION,
    process_staff_notification,
)

logger = logging.getLogger(__name__)


@register(EVENT_TYPE_DELIVERY_DISPATCHED, manages_own_transaction=True)
def handle_delivery_dispatched(payload: dict[str, Any], context: TenantContext | None) -> None:
    """Асинхронная доставка внешнего уведомления клиенту."""
    delivery_id = payload.get("delivery_id")
    if not delivery_id:
        return

    if context is None:
        raw_org_id = (
            TicketDelivery.objects.filter(id=delivery_id)
            .values_list("organization_id", flat=True)
            .first()
        )
        if not raw_org_id:
            return
        from chatballs.tenancy.lookup import load_organization

        org = load_organization(raw_org_id)
        if not org:
            return
        context = TenantContext.for_resource(org)

    # 1. Захват записи доставки и проверка статуса
    delivery = None
    with tenant_atomic(context):
        delivery = (
            TicketDelivery.objects.select_for_update(skip_locked=True)
            .select_related("ticket", "event")
            .filter(id=delivery_id)
            .first()
        )
        if delivery is None:
            return

        if delivery.status in (TicketDeliveryStatus.SENT, TicketDeliveryStatus.SUPPRESSED):
            return

        if delivery.customer_notice == CustomerNoticePolicy.SUPPRESS:
            delivery.status = TicketDeliveryStatus.SUPPRESSED
            delivery.save(update_fields=["status", "updated_at"])
            return

    # 2. Выполнение отправки наружу без удержания транзакции БД
    delivery_success = False
    delivery_error = ""
    try:
        delivery_success = customer_notifications.send_delivery_to_customer(delivery)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to deliver ticket notification for delivery %s", delivery_id)
        delivery_error = str(exc)

    # 3. Фиксация результата доставки в БД
    with tenant_atomic(context):
        locked_delivery = (
            TicketDelivery.objects.select_for_update()
            .filter(id=delivery_id)
            .first()
        )
        if locked_delivery is None:
            return

        locked_delivery.attempts += 1
        if delivery_success:
            locked_delivery.status = TicketDeliveryStatus.SENT
            locked_delivery.sent_at = timezone.now()
            locked_delivery.save(
                update_fields=["status", "sent_at", "attempts", "updated_at"]
            )
        else:
            locked_delivery.last_error = delivery_error
            if locked_delivery.attempts >= locked_delivery.max_attempts:
                locked_delivery.status = TicketDeliveryStatus.FAILED
            else:
                locked_delivery.status = TicketDeliveryStatus.PENDING
            locked_delivery.save(
                update_fields=["status", "attempts", "last_error", "updated_at"]
            )


@register(EVENT_TYPE_STAFF_NOTIFICATION)
def handle_staff_notification(payload: dict[str, Any], context: TenantContext | None) -> None:
    """Обработка создания внутренних уведомлений для сотрудников."""
    process_staff_notification(payload, context)
