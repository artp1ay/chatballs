from __future__ import annotations

from typing import ClassVar

from django.db import models, transaction

from chatballs.identity.models import Organization
from chatballs.tenancy.models import TenantRelationModel


class HeldeskSettings(TenantRelationModel):
    """Настройки модуля службы поддержки (Heldesk) для организации."""

    tenant_relation_fields: ClassVar[tuple[str, ...]] = ()

    organization = models.OneToOneField(
        "identity.Organization",
        on_delete=models.PROTECT,
        related_name="helpdesk_settings",
    )
    is_enabled = models.BooleanField(default=True)
    ticket_number_prefix = models.CharField(max_length=16, default="TKT")
    default_category = models.CharField(max_length=64, default="general")
    auto_close_resolved_days = models.PositiveIntegerField(default=7)

    def __str__(self) -> str:
        return f"HeldeskSettings({self.organization_id})"


class TicketNumberCounter(TenantRelationModel):
    """Потокобезопасный счётчик номеров заявок организации."""

    tenant_relation_fields: ClassVar[tuple[str, ...]] = ()

    organization = models.OneToOneField(
        "identity.Organization",
        on_delete=models.PROTECT,
        related_name="ticket_counter",
    )
    next_number = models.PositiveBigIntegerField(default=1)

    def __str__(self) -> str:
        return f"TicketNumberCounter({self.organization_id}: {self.next_number})"

    @classmethod
    def allocate_number(
        cls,
        organization: Organization,
        prefix: str | None = None,
    ) -> str:
        """Атомарная генерация следующего номера вида TKT-000001 под select_for_update."""
        with transaction.atomic():
            counter, _ = cls.objects.select_for_update().get_or_create(
                organization=organization,
                defaults={"next_number": 1},
            )
            current = counter.next_number
            counter.next_number = current + 1
            counter.save(update_fields=["next_number"])

            if not prefix:
                settings_obj = HeldeskSettings.objects.filter(organization=organization).first()
                prefix = settings_obj.ticket_number_prefix if settings_obj else "TKT"

            return f"{prefix}-{current:06d}"
