from __future__ import annotations

from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from chatballs.tenancy.models import TenantRelationModel


class ChannelRoutingMode(models.TextChoices):
    """Режим выбора исполнителя для входящего события канала."""

    AI_FIRST = "AI_FIRST", "AI по умолчанию"
    HUMAN_ONLY = "HUMAN_ONLY", "Только операторы"
    RULE_BASED = "RULE_BASED", "По правилам (гибридный)"


class RuleTriggerEvent(models.TextChoices):
    CONVERSATION_CREATED = "CONVERSATION_CREATED", "Создание диалога"
    MESSAGE_RECEIVED = "MESSAGE_RECEIVED", "Входящее сообщение"


class RuleActionTarget(models.TextChoices):
    ROUTE_TO_AI = "ROUTE_TO_AI", "Направить агенту AI"
    ROUTE_TO_HUMAN = "ROUTE_TO_HUMAN", "Направить в очередь операторов"
    ASSIGN_GROUP = "ASSIGN_GROUP", "Назначить группу операторов"
    DROP_SILENTLY = "DROP_SILENTLY", "Игнорировать как спам"


# Канал обработки — якорь AI-контекста (ADR-HUB-0019). Группа видимости и
# ссылка на провайдер-интеграцию. Поведение AI (модель, инструкции, знания)
# живёт на агенте канала (ADR-CHATBALLS-0023).


class Channel(models.Model):
    organization = models.ForeignKey(
        "identity.Organization",
        on_delete=models.PROTECT,
        related_name="channels",
    )
    code = models.SlugField(max_length=64)
    name = models.CharField(max_length=255)
    # Группа видимости (ADR-CHATBALLS-0043): новые диалоги канала попадают в неё.
    # NULL — диалоги видны всем сотрудникам.
    group = models.ForeignKey(
        "identity.EmployeeGroup",
        on_delete=models.SET_NULL,
        related_name="channels",
        null=True,
        blank=True,
    )
    # LLM-провайдер канала (ADR-CHATBALLS-0020).
    provider_integration = models.ForeignKey(
        "integrations.Integration",
        on_delete=models.PROTECT,
        related_name="channels",
        null=True,
        blank=True,
    )
    is_active = models.BooleanField(default=True)
    routing_mode = models.CharField(
        max_length=16,
        choices=ChannelRoutingMode.choices,
        default=ChannelRoutingMode.AI_FIRST,
        db_index=True,
    )
    # Политика канала: анонимные сессии и самозаявленный контакт используются
    # веб-виджетом и порталом. Коммерческие флаги удалены вместе с доменом
    # продаж (ADR-CHATBALLS-0041) и сущностью Product (ADR-CHATBALLS-0045).
    allow_anonymous_sessions = models.BooleanField(default=True)
    allow_self_reported_contact = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "code"],
                name="uniq_channel_org_code",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.organization.slug}/{self.code}"


class ChannelRoutingRule(TenantRelationModel):
    """Правило выбора исполнителя для входящего события канала."""

    tenant_relation_fields = ("channel", "target_group")

    organization = models.ForeignKey(
        "identity.Organization",
        on_delete=models.PROTECT,
        related_name="routing_rules",
    )
    channel = models.ForeignKey(
        Channel,
        on_delete=models.CASCADE,
        related_name="routing_rules",
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    # Меньше число — выше приоритет. Порядок правил не должен зависеть от
    # времени создания, поэтому вторичным ключом остаётся id.
    priority = models.PositiveIntegerField(
        default=100,
        db_index=True,
        validators=[MinValueValidator(1), MaxValueValidator(1000)],
    )
    is_active = models.BooleanField(default=True, db_index=True)
    trigger_event = models.CharField(
        max_length=32,
        choices=RuleTriggerEvent.choices,
        default=RuleTriggerEvent.CONVERSATION_CREATED,
    )
    conditions = models.JSONField(default=dict, blank=True)
    action_target = models.CharField(
        max_length=32,
        choices=RuleActionTarget.choices,
        default=RuleActionTarget.ROUTE_TO_AI,
    )
    target_group = models.ForeignKey(
        "identity.EmployeeGroup",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["priority", "id"]
        indexes = [
            models.Index(
                fields=["channel", "is_active", "priority"],
                name="routing_rule_channel_order",
            ),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(priority__range=(1, 1000)),
                name="routing_rule_priority_range",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(action_target=RuleActionTarget.ASSIGN_GROUP)
                    & models.Q(target_group__isnull=False)
                )
                | ~models.Q(action_target=RuleActionTarget.ASSIGN_GROUP),
                name="routing_rule_assign_group",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.channel_id}:rule:{self.pk}"

    def clean(self) -> None:
        super().clean()
        from chatballs.channels.rules.validators import (
            InvalidRuleCondition,
            validate_conditions,
        )

        try:
            validate_conditions(self.conditions)
        except InvalidRuleCondition as error:
            raise ValidationError({"conditions": str(error)}) from error
        if (
            self.action_target == RuleActionTarget.ASSIGN_GROUP
            and self.target_group_id is None
        ):
            raise ValidationError(
                {"target_group": "Для назначения группы требуется указать группу."}
            )

    def save(self, *args: object, **kwargs: object) -> None:
        self.full_clean()
        super().save(*args, **kwargs)


class ChannelBusinessHours(TenantRelationModel):
    """Часовой пояс и недельный график доступности операторов канала."""

    tenant_relation_fields = ("channel",)

    organization = models.ForeignKey(
        "identity.Organization",
        on_delete=models.PROTECT,
        related_name="+",
    )
    channel = models.OneToOneField(
        Channel,
        on_delete=models.CASCADE,
        related_name="business_hours",
    )
    timezone = models.CharField(max_length=64, default="UTC")
    weekly_schedule = models.JSONField(default=dict, blank=True)
    holidays = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["channel_id"]

    def __str__(self) -> str:
        return f"business-hours:{self.channel_id}"

    def clean(self) -> None:
        super().clean()
        from chatballs.channels.rules.validators import validate_business_hours

        validate_business_hours(
            timezone_name=self.timezone,
            weekly_schedule=self.weekly_schedule,
            holidays=self.holidays,
        )

    def save(self, *args: object, **kwargs: object) -> None:
        self.full_clean()
        super().save(*args, **kwargs)
