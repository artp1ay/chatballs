from __future__ import annotations

from typing import ClassVar

from django.db import models

from chatballs.tenancy.models import TenantRelationModel


class TicketStatus(models.TextChoices):
    NEW = "NEW", "NEW"
    IN_PROGRESS = "IN_PROGRESS", "IN_PROGRESS"
    WAITING_CUSTOMER = "WAITING_CUSTOMER", "WAITING_CUSTOMER"
    RESOLVED = "RESOLVED", "RESOLVED"
    CLOSED = "CLOSED", "CLOSED"
    CANCELLED = "CANCELLED", "CANCELLED"
    DUPLICATE = "DUPLICATE", "DUPLICATE"


class TicketPriority(models.TextChoices):
    LOW = "LOW", "LOW"
    NORMAL = "NORMAL", "NORMAL"
    HIGH = "HIGH", "HIGH"
    URGENT = "URGENT", "URGENT"


class Ticket(TenantRelationModel):
    """Канонический агрегат заявки службы поддержки."""

    tenant_relation_fields: ClassVar[tuple[str, ...]] = (
        "requester_contact",
        "assignee_membership",
        "group",
        "origin_conversation",
    )

    id = models.BigAutoField(primary_key=True)
    organization = models.ForeignKey(
        "identity.Organization",
        on_delete=models.PROTECT,
        related_name="tickets",
    )
    number = models.CharField(max_length=32, db_index=True)
    subject = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    status = models.CharField(
        max_length=32,
        choices=TicketStatus.choices,
        default=TicketStatus.NEW,
        db_index=True,
    )
    priority = models.CharField(
        max_length=32,
        choices=TicketPriority.choices,
        default=TicketPriority.NORMAL,
        db_index=True,
    )
    category = models.CharField(max_length=64, default="general", db_index=True)

    requester_contact = models.ForeignKey(
        "conversations.Contact",
        on_delete=models.PROTECT,
        related_name="requested_tickets",
        null=True,
        blank=True,
    )
    assignee_membership = models.ForeignKey(
        "identity.OrganizationMembership",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_tickets",
    )
    group = models.ForeignKey(
        "identity.EmployeeGroup",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tickets",
    )
    origin_conversation = models.ForeignKey(
        "conversations.Conversation",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="origin_tickets",
    )

    version = models.PositiveIntegerField(default=1)
    resolution_reason = models.TextField(blank=True, default="")
    cancellation_reason = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "number"],
                name="uniq_ticket_organization_number",
            ),
        ]

    def __str__(self) -> str:
        return f"Ticket({self.number}: {self.subject})"
