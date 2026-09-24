from __future__ import annotations

from typing import ClassVar

from django.db import models

from chatballs.tenancy.models import TenantRelationModel
from chatballs.tickets.models.ticket import Ticket


class TicketPublicAccess(TenantRelationModel):
    """Токен гостевого доступа для публичного просмотра заявки без аутентификации."""

    tenant_relation_fields: ClassVar[tuple[str, ...]] = ("ticket",)

    ticket = models.OneToOneField(
        Ticket,
        on_delete=models.CASCADE,
        related_name="public_access",
    )
    token_hash = models.CharField(max_length=128, unique=True, db_index=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"TicketPublicAccess(ticket={self.ticket_id}, active={self.is_active})"
