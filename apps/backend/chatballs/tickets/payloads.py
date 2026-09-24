"""Сериализация моделей заявок, истории и коммуникаций в JSON."""

from __future__ import annotations

from typing import Any

from chatballs.tickets.models.activities import (
    TicketComment,
    TicketEvent,
    TicketNote,
)
from chatballs.tickets.models.ticket import Ticket


def ticket_payload(ticket: Ticket) -> dict[str, Any]:
    """Полное представление агрегата заявки в REST API."""
    assignee = None
    if ticket.assignee_membership is not None:
        user = ticket.assignee_membership.user
        assignee = {
            "id": ticket.assignee_membership_id,
            "user_id": user.id,
            "name": user.get_full_name() or user.email,
            "email": user.email,
        }

    requester = None
    if ticket.requester_contact is not None:
        requester = {
            "id": ticket.requester_contact_id,
            "name": ticket.requester_contact.name,
        }

    group = None
    if ticket.group is not None:
        group = {
            "id": ticket.group_id,
            "name": ticket.group.name,
        }

    return {
        "id": ticket.id,
        "organization_id": ticket.organization_id,
        "number": ticket.number,
        "subject": ticket.subject,
        "description": ticket.description,
        "status": ticket.status,
        "priority": ticket.priority,
        "category": ticket.category,
        "requester_contact_id": ticket.requester_contact_id,
        "requester_contact": requester,
        "assignee_membership_id": ticket.assignee_membership_id,
        "assignee": assignee,
        "group_id": ticket.group_id,
        "group": group,
        "origin_conversation_id": ticket.origin_conversation_id,
        "version": ticket.version,
        "resolution_reason": ticket.resolution_reason,
        "cancellation_reason": ticket.cancellation_reason,
        "created_at": ticket.created_at.isoformat(),
        "updated_at": ticket.updated_at.isoformat(),
        "resolved_at": ticket.resolved_at.isoformat() if ticket.resolved_at else None,
        "closed_at": ticket.closed_at.isoformat() if ticket.closed_at else None,
    }


def ticket_note_payload(note: TicketNote) -> dict[str, Any]:
    """Представление внутренней заметки оператора."""
    user = note.author_membership.user
    return {
        "id": note.id,
        "ticket_id": note.ticket_id,
        "author_membership_id": note.author_membership_id,
        "author_name": user.get_full_name() or user.email,
        "text": note.text,
        "created_at": note.created_at.isoformat(),
    }


def ticket_comment_payload(comment: TicketComment) -> dict[str, Any]:
    """Представление комментария к заявке."""
    author_name = "System"
    if comment.author_membership is not None:
        user = comment.author_membership.user
        author_name = user.get_full_name() or user.email
    elif comment.author_contact is not None:
        author_name = comment.author_contact.name or f"contact:{comment.author_contact.id}"

    return {
        "id": comment.id,
        "ticket_id": comment.ticket_id,
        "author_membership_id": comment.author_membership_id,
        "author_contact_id": comment.author_contact_id,
        "author_name": author_name,
        "text": comment.text,
        "is_public": comment.is_public,
        "created_at": comment.created_at.isoformat(),
    }


def ticket_event_payload(event: TicketEvent) -> dict[str, Any]:
    """Представление записи аудита заявки."""
    actor_name = "System"
    if event.actor_membership is not None:
        user = event.actor_membership.user
        actor_name = user.get_full_name() or user.email
    elif event.actor_contact is not None:
        actor_name = event.actor_contact.name or f"contact:{event.actor_contact.id}"

    return {
        "id": event.id,
        "ticket_id": event.ticket_id,
        "event_type": event.event_type,
        "actor_membership_id": event.actor_membership_id,
        "actor_contact_id": event.actor_contact_id,
        "actor_name": actor_name,
        "old_values": event.old_values,
        "new_values": event.new_values,
        "notify_customer": event.notify_customer,
        "suppression_reason": event.suppression_reason,
        "created_at": event.created_at.isoformat(),
    }


def ticket_public_payload(ticket: Ticket) -> dict[str, Any]:
    """Ограниченное публичное представление для гостевого доступа."""
    return {
        "number": ticket.number,
        "subject": ticket.subject,
        "status": ticket.status,
        "category": ticket.category,
        "created_at": ticket.created_at.isoformat(),
        "resolved_at": ticket.resolved_at.isoformat() if ticket.resolved_at else None,
        "closed_at": ticket.closed_at.isoformat() if ticket.closed_at else None,
    }
