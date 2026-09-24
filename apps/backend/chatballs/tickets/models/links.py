from __future__ import annotations

from typing import ClassVar

from django.db import models

from chatballs.tenancy.models import TenantRelationModel
from chatballs.tickets.models.ticket import Ticket


class TicketConversationLink(TenantRelationModel):
    """Связь заявки с оперативным диалогом чата."""

    tenant_relation_fields: ClassVar[tuple[str, ...]] = (
        "ticket",
        "conversation",
        "origin_channel",
    )

    ticket = models.ForeignKey(
        Ticket,
        on_delete=models.CASCADE,
        related_name="conversation_links",
    )
    conversation = models.ForeignKey(
        "conversations.Conversation",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ticket_links",
    )
    origin_channel = models.ForeignKey(
        "channels.Channel",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    link_type = models.CharField(max_length=32, default="primary")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"TicketConversationLink({self.ticket_id} <-> {self.conversation_id})"


class TicketContactLink(TenantRelationModel):
    """Связь заявки с дополнительными контактами клиентов."""

    tenant_relation_fields: ClassVar[tuple[str, ...]] = (
        "ticket",
        "contact",
    )

    ticket = models.ForeignKey(
        Ticket,
        on_delete=models.CASCADE,
        related_name="contact_links",
    )
    contact = models.ForeignKey(
        "conversations.Contact",
        on_delete=models.PROTECT,
        related_name="ticket_contact_links",
    )
    role = models.CharField(max_length=32, default="participant")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"TicketContactLink({self.ticket_id} <-> {self.contact_id} as {self.role})"
