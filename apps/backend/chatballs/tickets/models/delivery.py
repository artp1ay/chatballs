from __future__ import annotations

import hashlib
from typing import ClassVar

from django.db import models

from chatballs.tenancy.models import TenantRelationModel


class TicketDeliveryStatus(models.TextChoices):
    PENDING = "PENDING", "В очереди"
    SENT = "SENT", "Отправлено"
    FAILED = "FAILED", "Ошибка"
    SUPPRESSED = "SUPPRESSED", "Подавлено"
    UNCERTAIN = "UNCERTAIN", "Неопределенно"


class TicketDeliveryChannel(models.TextChoices):
    EMAIL = "EMAIL", "Email"
    TELEGRAM = "TELEGRAM", "Telegram"
    VK = "VK", "VK"
    MAX = "MAX", "MAX"
    WEB = "WEB", "Web"


class CustomerNoticePolicy(models.TextChoices):
    SEND = "SEND", "Отправить"
    SUPPRESS = "SUPPRESS", "Подавить"
    NOT_REQUIRED = "NOT_REQUIRED", "Не требуется"


def compute_destination_hash(channel: str, destination: str) -> str:
    """Дедупликационный хэш канала и точки назначения."""
    return hashlib.sha256(f"{channel}:{destination}".encode("utf-8")).hexdigest()


class TicketDelivery(TenantRelationModel):
    """Запись в конвейере доставки клиентских уведомлений."""

    tenant_relation_fields: ClassVar[tuple[str, ...]] = ("ticket", "event")

    id = models.BigAutoField(primary_key=True)
    ticket = models.ForeignKey(
        "tickets.Ticket",
        on_delete=models.CASCADE,
        related_name="deliveries",
    )
    event = models.ForeignKey(
        "tickets.TicketEvent",
        on_delete=models.CASCADE,
        related_name="deliveries",
    )
    channel = models.CharField(max_length=32, choices=TicketDeliveryChannel.choices)
    destination = models.CharField(max_length=255)
    destination_key_hash = models.CharField(max_length=64, db_index=True)
    status = models.CharField(
        max_length=32,
        choices=TicketDeliveryStatus.choices,
        default=TicketDeliveryStatus.PENDING,
        db_index=True,
    )
    customer_notice = models.CharField(
        max_length=32,
        choices=CustomerNoticePolicy.choices,
        default=CustomerNoticePolicy.SEND,
    )
    suppression_reason = models.TextField(blank=True, default="")
    attempts = models.PositiveIntegerField(default=0)
    max_attempts = models.PositiveIntegerField(default=5)
    last_error = models.TextField(blank=True, default="")
    lease_expires_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["event", "destination_key_hash"],
                name="uniq_ticket_delivery_event_destination",
            )
        ]
        indexes = [
            models.Index(fields=["status", "lease_expires_at"]),
        ]

    def save(self, *args: object, **kwargs: object) -> None:
        if not self.destination_key_hash and self.channel and self.destination:
            self.destination_key_hash = compute_destination_hash(
                self.channel, self.destination
            )
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"TicketDelivery({self.id}: {self.channel}/{self.status})"
