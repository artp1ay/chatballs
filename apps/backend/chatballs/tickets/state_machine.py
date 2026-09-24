"""Машина состояний и доменный сервис переходов статусов заявки."""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from chatballs.i18n import t
from chatballs.tickets.models.activities import (
    TicketComment,
    TicketEvent,
    TicketEventType,
)
from chatballs.tickets.models.delivery import CustomerNoticePolicy
from chatballs.tickets.models.ticket import Ticket, TicketStatus

TRANSITIONS: dict[str, set[str]] = {
    TicketStatus.NEW: {
        TicketStatus.IN_PROGRESS,
        TicketStatus.CANCELLED,
        TicketStatus.DUPLICATE,
    },
    TicketStatus.IN_PROGRESS: {
        TicketStatus.WAITING_CUSTOMER,
        TicketStatus.RESOLVED,
        TicketStatus.CANCELLED,
        TicketStatus.DUPLICATE,
    },
    TicketStatus.WAITING_CUSTOMER: {
        TicketStatus.IN_PROGRESS,
        TicketStatus.RESOLVED,
        TicketStatus.CANCELLED,
        TicketStatus.DUPLICATE,
    },
    TicketStatus.RESOLVED: {
        TicketStatus.IN_PROGRESS,
        TicketStatus.CLOSED,
        TicketStatus.CANCELLED,
        TicketStatus.DUPLICATE,
    },
    TicketStatus.CLOSED: set(),
    TicketStatus.CANCELLED: set(),
    TicketStatus.DUPLICATE: set(),
}


class VersionConflictError(Exception):
    """Исключение при расхождении версий оптимистической блокировки."""

    def __init__(self, current_version: int, message: str | None = None) -> None:
        self.current_version = current_version
        super().__init__(message or t("tickets.version_conflict"))


class TransitionError(Exception):
    """Исключение при недопустимом переходе между статусами."""


def validate_transition(
    ticket: Ticket,
    target_status: str,
    *,
    reason: str | None = None,
    expected_version: int | None = None,
) -> None:
    """Проверка инвариантов и версии перед выполнением перехода."""
    if expected_version is not None and ticket.version != expected_version:
        raise VersionConflictError(current_version=ticket.version)

    allowed = TRANSITIONS.get(ticket.status, set())
    if target_status not in allowed:
        raise TransitionError(
            t(
                "tickets.invalid_transition",
                current=ticket.status,
                target=target_status,
            )
        )

    clean_reason = (reason or "").strip()
    if target_status == TicketStatus.CANCELLED and not clean_reason:
        raise TransitionError(t("tickets.cancellation_reason_required"))

    if target_status == TicketStatus.DUPLICATE and not clean_reason:
        raise TransitionError(t("tickets.duplicate_reason_required"))


def execute_transition(
    ticket: Ticket,
    target_status: str,
    *,
    actor_membership=None,
    reason: str | None = None,
    comment: str | None = None,
    expected_version: int | None = None,
    customer_notice: str = CustomerNoticePolicy.SEND,
    suppression_reason: str = "",
) -> Ticket:
    """Атомарный переход статуса заявки с фиксацией версий и созданием событий."""
    with transaction.atomic():
        locked_ticket = (
            Ticket.objects.select_for_update()
            .select_related("organization")
            .get(id=ticket.id, organization_id=ticket.organization_id)
        )

        validate_transition(
            locked_ticket,
            target_status,
            reason=reason,
            expected_version=expected_version,
        )

        old_status = locked_ticket.status
        locked_ticket.status = target_status
        locked_ticket.version += 1
        now = timezone.now()

        if target_status == TicketStatus.RESOLVED:
            locked_ticket.resolved_at = now
            if reason:
                locked_ticket.resolution_reason = reason.strip()
        elif target_status == TicketStatus.CLOSED:
            locked_ticket.closed_at = now
        elif target_status in (TicketStatus.CANCELLED, TicketStatus.DUPLICATE):
            locked_ticket.closed_at = now
            locked_ticket.cancellation_reason = (reason or "").strip()
        elif old_status == TicketStatus.RESOLVED and target_status == TicketStatus.IN_PROGRESS:
            locked_ticket.resolved_at = None
            locked_ticket.resolution_reason = ""

        locked_ticket.save()

        event = TicketEvent.objects.create(
            organization=locked_ticket.organization,
            ticket=locked_ticket,
            event_type=TicketEventType.STATUS_CHANGED,
            actor_membership=actor_membership,
            old_values={"status": old_status},
            new_values={
                "status": target_status,
                "reason": (reason or "").strip(),
                "version": locked_ticket.version,
            },
            notify_customer=(customer_notice == CustomerNoticePolicy.SEND),
            suppression_reason=(suppression_reason or "").strip(),
        )

        if comment and comment.strip():
            TicketComment.objects.create(
                organization=locked_ticket.organization,
                ticket=locked_ticket,
                author_membership=actor_membership,
                text=comment.strip(),
                is_public=True,
            )

        from chatballs.tickets.services.delivery_dispatch import (
            dispatch_ticket_event,
        )

        dispatch_ticket_event(
            locked_ticket,
            event,
            customer_notice=customer_notice,
            suppression_reason=(suppression_reason or "").strip(),
        )

        return locked_ticket
