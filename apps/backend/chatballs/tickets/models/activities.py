from __future__ import annotations

from typing import ClassVar

from django.db import models

from chatballs.tenancy.models import TenantRelationModel
from chatballs.tickets.models.ticket import Ticket


class TicketEventType(models.TextChoices):
    CREATED = "CREATED", "CREATED"
    CREATED_FROM_CONVERSATION = "CREATED_FROM_CONVERSATION", "CREATED_FROM_CONVERSATION"
    STATUS_CHANGED = "STATUS_CHANGED", "STATUS_CHANGED"
    ASSIGNEE_CHANGED = "ASSIGNEE_CHANGED", "ASSIGNEE_CHANGED"
    PRIORITY_CHANGED = "PRIORITY_CHANGED", "PRIORITY_CHANGED"
    COMMENT_ADDED = "COMMENT_ADDED", "COMMENT_ADDED"
    NOTE_ADDED = "NOTE_ADDED", "NOTE_ADDED"
    LINKED_TO_CONVERSATION = "LINKED_TO_CONVERSATION", "LINKED_TO_CONVERSATION"
    UPDATED = "UPDATED", "UPDATED"


class TicketNote(TenantRelationModel):
    """Внутренняя заметка команды по заявке (видна только операторам)."""

    tenant_relation_fields: ClassVar[tuple[str, ...]] = (
        "ticket",
        "author_membership",
    )

    ticket = models.ForeignKey(
        Ticket,
        on_delete=models.CASCADE,
        related_name="notes",
    )
    author_membership = models.ForeignKey(
        "identity.OrganizationMembership",
        on_delete=models.PROTECT,
        related_name="ticket_notes",
    )
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"TicketNote({self.ticket_id} by {self.author_membership_id})"


class TicketComment(TenantRelationModel):
    """Публичные комментарии и переписка по заявке."""

    tenant_relation_fields: ClassVar[tuple[str, ...]] = (
        "ticket",
        "author_membership",
        "author_contact",
    )

    ticket = models.ForeignKey(
        Ticket,
        on_delete=models.CASCADE,
        related_name="comments",
    )
    author_membership = models.ForeignKey(
        "identity.OrganizationMembership",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    author_contact = models.ForeignKey(
        "conversations.Contact",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    text = models.TextField()
    is_public = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"TicketComment({self.ticket_id})"


class TicketEvent(TenantRelationModel):
    """Неизменяемый аудит-лог событий по заявке."""

    tenant_relation_fields: ClassVar[tuple[str, ...]] = (
        "ticket",
        "actor_membership",
        "actor_contact",
    )

    ticket = models.ForeignKey(
        Ticket,
        on_delete=models.CASCADE,
        related_name="events",
    )
    event_type = models.CharField(max_length=64, db_index=True)
    actor_membership = models.ForeignKey(
        "identity.OrganizationMembership",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    actor_contact = models.ForeignKey(
        "conversations.Contact",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    old_values = models.JSONField(default=dict, blank=True)
    new_values = models.JSONField(default=dict, blank=True)
    notify_customer = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    def __str__(self) -> str:
        return f"TicketEvent({self.ticket_id}: {self.event_type})"
