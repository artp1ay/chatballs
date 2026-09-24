"""Селекторы чтения данных заявок, истории и коммуникаций."""

from __future__ import annotations

from django.db.models import Q, QuerySet

from chatballs.api.pagination import SortKey
from chatballs.identity.models import Organization
from chatballs.tickets.models.activities import (
    TicketComment,
    TicketEvent,
    TicketNote,
)
from chatballs.tickets.models.ticket import Ticket

DEFAULT_TICKET_SORT_KEYS = (
    SortKey("created_at", descending=True),
    SortKey("id", descending=True),
)


def get_sort_keys(sort_param: str | None) -> tuple[SortKey, ...]:
    """Разбор параметра сортировки с обязательным id в конце."""
    if not sort_param:
        return DEFAULT_TICKET_SORT_KEYS

    param = sort_param.strip()
    desc = param.startswith("-")
    field = param.lstrip("-")

    if field in ("created_at", "updated_at", "priority"):
        return (SortKey(field, descending=desc), SortKey("id", descending=desc))

    return DEFAULT_TICKET_SORT_KEYS


def list_tickets(
    organization: Organization,
    *,
    status: str | None = None,
    priority: str | None = None,
    assignee_id: int | None = None,
    requester_id: int | None = None,
    group_id: int | None = None,
    search: str | None = None,
) -> QuerySet[Ticket]:
    """Формирование QuerySet заявок организации с фильтрацией."""
    qs = (
        Ticket.objects.filter(organization=organization)
        .select_related(
            "organization",
            "requester_contact",
            "assignee_membership",
            "assignee_membership__user",
            "group",
            "origin_conversation",
        )
    )

    if status:
        statuses = [s.strip() for s in status.split(",") if s.strip()]
        if statuses:
            qs = qs.filter(status__in=statuses)

    if priority:
        priorities = [p.strip() for p in priority.split(",") if p.strip()]
        if priorities:
            qs = qs.filter(priority__in=priorities)

    if assignee_id is not None:
        qs = qs.filter(assignee_membership_id=assignee_id)

    if requester_id is not None:
        qs = qs.filter(requester_contact_id=requester_id)

    if group_id is not None:
        qs = qs.filter(group_id=group_id)

    if search:
        term = search.strip()
        qs = qs.filter(Q(number__icontains=term) | Q(subject__icontains=term))

    return qs


def ticket_for_organization(organization: Organization, ticket_id: int) -> Ticket:
    """Получение тикета организации по id со связанными сущностями."""
    return (
        Ticket.objects.select_related(
            "organization",
            "requester_contact",
            "assignee_membership",
            "assignee_membership__user",
            "group",
            "origin_conversation",
        )
        .get(id=ticket_id, organization=organization)
    )


def ticket_notes(ticket: Ticket) -> QuerySet[TicketNote]:
    """Список внутренних заметок команды по заявке."""
    return (
        TicketNote.objects.filter(ticket=ticket)
        .select_related("author_membership", "author_membership__user")
        .order_by("created_at", "id")
    )


def ticket_comments(ticket: Ticket, *, public_only: bool = False) -> QuerySet[TicketComment]:
    """Список комментариев по заявке."""
    qs = (
        TicketComment.objects.filter(ticket=ticket)
        .select_related("author_membership", "author_membership__user", "author_contact")
        .order_by("created_at", "id")
    )
    if public_only:
        qs = qs.filter(is_public=True)
    return qs


def ticket_events(ticket: Ticket) -> QuerySet[TicketEvent]:
    """Аудит-лог истории событий заявки."""
    return (
        TicketEvent.objects.filter(ticket=ticket)
        .select_related("actor_membership", "actor_membership__user", "actor_contact")
        .order_by("created_at", "id")
    )
