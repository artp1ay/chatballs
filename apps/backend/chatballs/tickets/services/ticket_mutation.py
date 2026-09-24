"""Сервисы изменения заявок, заметок и комментариев."""

from __future__ import annotations

from typing import Any

from django.db import transaction

from chatballs.conversations.models import Contact
from chatballs.identity.models import OrganizationMembership
from chatballs.tickets.models.activities import (
    TicketComment,
    TicketEvent,
    TicketEventType,
    TicketNote,
)
from chatballs.tickets.models.delivery import CustomerNoticePolicy
from chatballs.tickets.models.ticket import Ticket
from chatballs.tickets.realtime import notify_tickets_inbox_changed
from chatballs.tickets.services.delivery_dispatch import dispatch_ticket_event
from chatballs.tickets.services.staff_notifications import (
    enqueue_staff_notification,
)
from chatballs.tickets.state_machine import VersionConflictError


def update_ticket(
    ticket: Ticket,
    *,
    expected_version: int | None = None,
    actor_membership: OrganizationMembership | None = None,
    **updates: Any,
) -> Ticket:
    """Частичное обновление полей тикета с проверкой версии."""
    allowed_fields = {
        "subject",
        "description",
        "priority",
        "category",
        "assignee_membership",
        "group",
    }

    with transaction.atomic():
        locked = (
            Ticket.objects.select_for_update()
            .select_related("organization")
            .get(id=ticket.id, organization_id=ticket.organization_id)
        )

        if expected_version is not None and locked.version != expected_version:
            raise VersionConflictError(current_version=locked.version)

        old_values: dict[str, Any] = {}
        new_values: dict[str, Any] = {}

        for field, value in updates.items():
            if field not in allowed_fields:
                continue

            current_val = getattr(locked, field)
            if current_val != value:
                old_values[field] = getattr(current_val, "id", current_val)
                new_values[field] = getattr(value, "id", value)
                setattr(locked, field, value)

        if not new_values:
            return locked

        locked.version += 1
        locked.full_clean()
        locked.save()

        # Запись специализированных и общих событий
        events_to_dispatch = []
        if "assignee_membership" in new_values:
            ev = TicketEvent.objects.create(
                organization=locked.organization,
                ticket=locked,
                event_type=TicketEventType.ASSIGNEE_CHANGED,
                actor_membership=actor_membership,
                old_values={"assignee_id": old_values.get("assignee_membership")},
                new_values={"assignee_id": new_values.get("assignee_membership")},
            )
            events_to_dispatch.append(ev)

        if "priority" in new_values:
            ev = TicketEvent.objects.create(
                organization=locked.organization,
                ticket=locked,
                event_type=TicketEventType.PRIORITY_CHANGED,
                actor_membership=actor_membership,
                old_values={"priority": old_values.get("priority")},
                new_values={"priority": new_values.get("priority")},
            )
            events_to_dispatch.append(ev)

        main_event = TicketEvent.objects.create(
            organization=locked.organization,
            ticket=locked,
            event_type=TicketEventType.UPDATED,
            actor_membership=actor_membership,
            old_values=old_values,
            new_values=new_values,
        )
        events_to_dispatch.append(main_event)

        notify_tickets_inbox_changed(locked.organization_id)
        for ev in events_to_dispatch:
            enqueue_staff_notification(locked, ev)

        return locked


def add_ticket_note(
    ticket: Ticket,
    *,
    author_membership: OrganizationMembership,
    text: str,
) -> TicketNote:
    """Добавление внутренней заметки оператора."""
    with transaction.atomic():
        note = TicketNote(
            organization=ticket.organization,
            ticket=ticket,
            author_membership=author_membership,
            text=text.strip(),
        )
        note.full_clean()
        note.save()

        event = TicketEvent.objects.create(
            organization=ticket.organization,
            ticket=ticket,
            event_type=TicketEventType.NOTE_ADDED,
            actor_membership=author_membership,
            new_values={"note_id": note.id},
        )
        notify_tickets_inbox_changed(ticket.organization_id)
        enqueue_staff_notification(ticket, event)
        return note


def add_ticket_comment(
    ticket: Ticket,
    *,
    text: str,
    author_membership: OrganizationMembership | None = None,
    author_contact: Contact | None = None,
    is_public: bool = True,
    customer_notice: str = CustomerNoticePolicy.SEND,
    suppression_reason: str = "",
) -> TicketComment:
    """Добавление комментария / сообщения в переписку по заявке."""
    with transaction.atomic():
        comment = TicketComment(
            organization=ticket.organization,
            ticket=ticket,
            author_membership=author_membership,
            author_contact=author_contact,
            text=text.strip(),
            is_public=is_public,
        )
        comment.full_clean()
        comment.save()

        notify_customer = is_public and (customer_notice == CustomerNoticePolicy.SEND)
        event = TicketEvent.objects.create(
            organization=ticket.organization,
            ticket=ticket,
            event_type=TicketEventType.COMMENT_ADDED,
            actor_membership=author_membership,
            actor_contact=author_contact,
            new_values={
                "comment_id": comment.id,
                "is_public": is_public,
            },
            notify_customer=notify_customer,
            suppression_reason=(suppression_reason or "").strip(),
        )

        dispatch_ticket_event(
            ticket,
            event,
            customer_notice=customer_notice if is_public else CustomerNoticePolicy.NOT_REQUIRED,
            suppression_reason=(suppression_reason or "").strip(),
        )
        return comment
