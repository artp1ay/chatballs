"""Сервис внутренних уведомлений сотрудников по событиям заявок."""

from __future__ import annotations

import logging
from typing import Any

from chatballs.events.services import DomainEvent, enqueue_event
from chatballs.i18n import t
from chatballs.notifications.models import NotificationAudience, NotificationType
from chatballs.notifications.services import notify
from chatballs.tenancy.context import TenantContext
from chatballs.tickets.models.activities import TicketEvent, TicketEventType
from chatballs.tickets.models.ticket import Ticket

logger = logging.getLogger(__name__)

EVENT_TYPE_STAFF_NOTIFICATION = "tickets.staff_notification"


def enqueue_staff_notification(
    ticket: Ticket,
    event: TicketEvent,
    *,
    context: TenantContext | None = None,
) -> None:
    """Постановка события внутреннего уведомления в Outbox."""
    enqueue_event(
        DomainEvent(
            aggregate_type="Ticket",
            aggregate_id=str(ticket.id),
            event_type=EVENT_TYPE_STAFF_NOTIFICATION,
            payload={
                "ticket_id": ticket.id,
                "event_id": event.id,
            },
            tenant_context=context,
        )
    )


def process_staff_notification(payload: dict[str, Any], context: TenantContext | None) -> None:
    """Обработка Outbox-события внутреннего уведомления сотрудникам."""
    ticket_id = payload.get("ticket_id")
    event_id = payload.get("event_id")
    if not ticket_id or not event_id:
        logger.warning("Invalid staff notification payload: %s", payload)
        return

    ticket = (
        Ticket.objects.select_related(
            "organization",
            "assignee_membership__user",
            "group",
        )
        .filter(id=ticket_id)
        .first()
    )
    if ticket is None:
        return

    event = (
        TicketEvent.objects.select_related("actor_membership__user", "actor_contact")
        .filter(id=event_id, ticket=ticket)
        .first()
    )
    if event is None:
        return

    if context is None:
        context = TenantContext.for_resource(ticket.organization)

    _dispatch_notification_for_event(ticket, event, context)


def _dispatch_notification_for_event(
    ticket: Ticket,
    event: TicketEvent,
    context: TenantContext,
) -> None:
    ev_type = event.event_type

    if ev_type in (TicketEventType.CREATED, TicketEventType.CREATED_FROM_CONVERSATION):
        _notify_new_ticket(ticket, event, context)
    elif ev_type == TicketEventType.ASSIGNEE_CHANGED:
        _notify_ticket_assigned(ticket, event, context)
    elif ev_type == TicketEventType.STATUS_CHANGED:
        _notify_status_changed(ticket, event, context)
    elif ev_type == TicketEventType.COMMENT_ADDED and event.actor_contact_id:
        _notify_customer_replied(ticket, event, context)


def _notify_new_ticket(ticket: Ticket, event: TicketEvent, context: TenantContext) -> None:
    params = {"number": ticket.number, "subject": ticket.subject}
    audience = NotificationAudience.ALL if ticket.group_id else NotificationAudience.OPERATORS
    notify(
        context=context,
        type=NotificationType.TICKET_NEW,
        audience=audience,
        audience_group=ticket.group,
        title=t("tickets.notification_ticket_new_title", **params),
        body=t("tickets.notification_ticket_new_body", **params),
        title_key="tickets.notification_ticket_new_title",
        body_key="tickets.notification_ticket_new_body",
        text_params=params,
        target_id=ticket.id,
        source_type="Ticket",
        source_id=ticket.id,
        dedup_key=f"ticket:{ticket.id}:new",
    )

    if ticket.assignee_membership and ticket.assignee_membership_id != event.actor_membership_id:
        notify(
            context=context,
            type=NotificationType.TICKET_ASSIGNED,
            audience=NotificationAudience.USER,
            recipient_user=ticket.assignee_membership.user,
            title=t("tickets.notification_ticket_assigned_title", **params),
            body=t("tickets.notification_ticket_assigned_body", **params),
            title_key="tickets.notification_ticket_assigned_title",
            body_key="tickets.notification_ticket_assigned_body",
            text_params=params,
            target_id=ticket.id,
            source_type="Ticket",
            source_id=ticket.id,
            dedup_key=f"ticket:{ticket.id}:assigned:{ticket.assignee_membership_id}",
        )


def _notify_ticket_assigned(ticket: Ticket, event: TicketEvent, context: TenantContext) -> None:
    if not ticket.assignee_membership:
        return
    if event.actor_membership_id == ticket.assignee_membership_id:
        return

    params = {"number": ticket.number, "subject": ticket.subject}
    notify(
        context=context,
        type=NotificationType.TICKET_ASSIGNED,
        audience=NotificationAudience.USER,
        recipient_user=ticket.assignee_membership.user,
        title=t("tickets.notification_ticket_assigned_title", **params),
        body=t("tickets.notification_ticket_assigned_body", **params),
        title_key="tickets.notification_ticket_assigned_title",
        body_key="tickets.notification_ticket_assigned_body",
        text_params=params,
        target_id=ticket.id,
        source_type="Ticket",
        source_id=ticket.id,
        dedup_key=f"ticket:{ticket.id}:assigned:{ticket.assignee_membership_id}:{event.id}",
    )


def _notify_status_changed(ticket: Ticket, event: TicketEvent, context: TenantContext) -> None:
    new_status = event.new_values.get("status", ticket.status)
    params = {"number": ticket.number, "status": new_status}
    assignee = ticket.assignee_membership
    actor_id = event.actor_membership_id

    if assignee and assignee.id != actor_id:
        notify(
            context=context,
            type=NotificationType.TICKET_STATUS_CHANGED,
            audience=NotificationAudience.USER,
            recipient_user=assignee.user,
            title=t("tickets.notification_ticket_status_changed_title", **params),
            body=t("tickets.notification_ticket_status_changed_body", **params),
            title_key="tickets.notification_ticket_status_changed_title",
            body_key="tickets.notification_ticket_status_changed_body",
            text_params=params,
            target_id=ticket.id,
            source_type="Ticket",
            source_id=ticket.id,
            dedup_key=f"ticket:{ticket.id}:status:{event.id}",
        )
    elif not assignee:
        notify(
            context=context,
            type=NotificationType.TICKET_STATUS_CHANGED,
            audience=NotificationAudience.ALL if ticket.group_id else NotificationAudience.OPERATORS,
            audience_group=ticket.group,
            title=t("tickets.notification_ticket_status_changed_title", **params),
            body=t("tickets.notification_ticket_status_changed_body", **params),
            title_key="tickets.notification_ticket_status_changed_title",
            body_key="tickets.notification_ticket_status_changed_body",
            text_params=params,
            target_id=ticket.id,
            source_type="Ticket",
            source_id=ticket.id,
            dedup_key=f"ticket:{ticket.id}:status:{event.id}",
        )


def _notify_customer_replied(ticket: Ticket, event: TicketEvent, context: TenantContext) -> None:
    params = {"number": ticket.number}
    assignee = ticket.assignee_membership

    if assignee:
        notify(
            context=context,
            type=NotificationType.TICKET_CUSTOMER_REPLIED,
            audience=NotificationAudience.USER,
            recipient_user=assignee.user,
            title=t("tickets.notification_ticket_customer_replied_title", **params),
            body=t("tickets.notification_ticket_customer_replied_body", **params),
            title_key="tickets.notification_ticket_customer_replied_title",
            body_key="tickets.notification_ticket_customer_replied_body",
            text_params=params,
            target_id=ticket.id,
            source_type="Ticket",
            source_id=ticket.id,
            dedup_key=f"ticket:{ticket.id}:customer_replied:{event.id}",
        )
    else:
        notify(
            context=context,
            type=NotificationType.TICKET_CUSTOMER_REPLIED,
            audience=NotificationAudience.ALL if ticket.group_id else NotificationAudience.OPERATORS,
            audience_group=ticket.group,
            title=t("tickets.notification_ticket_customer_replied_title", **params),
            body=t("tickets.notification_ticket_customer_replied_body", **params),
            title_key="tickets.notification_ticket_customer_replied_title",
            body_key="tickets.notification_ticket_customer_replied_body",
            text_params=params,
            target_id=ticket.id,
            source_type="Ticket",
            source_id=ticket.id,
            dedup_key=f"ticket:{ticket.id}:customer_replied:{event.id}",
        )
