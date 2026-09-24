"""Сервисы управления режимами, расписанием и правилами канала."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction

from chatballs.channels.authorization import CHANNELS_VIEW, require_channel_manage
from chatballs.channels.models import (
    Channel,
    ChannelBusinessHours,
    ChannelRoutingRule,
    RuleActionTarget,
    RuleTriggerEvent,
)
from chatballs.channels.rules.validators import (
    InvalidRuleCondition,
    validate_business_hours,
    validate_conditions,
)
from chatballs.channels.selectors import channel_for_context
from chatballs.identity.group_models import EmployeeGroup
from chatballs.tenancy.context import TenantContext


def get_channel(
    *, context: TenantContext, channel_id: int, capability: str = CHANNELS_VIEW
) -> Channel:
    return channel_for_context(
        context=context,
        channel_id=channel_id,
        capability=capability,
    )


def change_routing_mode(
    *, context: TenantContext, channel: Channel, value: object
) -> Channel:
    from chatballs.channels.services import ChannelUpdate, update_channel

    return update_channel(
        context=context,
        channel=channel,
        update=ChannelUpdate(routing_mode=value),
    )


def get_business_hours(
    *, channel: Channel
) -> ChannelBusinessHours | None:
    try:
        return channel.business_hours
    except ChannelBusinessHours.DoesNotExist:
        return None


@transaction.atomic
def save_business_hours(
    *, context: TenantContext, channel: Channel, data: dict[str, Any]
) -> ChannelBusinessHours:
    require_channel_manage(context)
    timezone_name = _required_string(data, "timezone", "timezone")
    weekly_schedule = deepcopy(data.get("weekly_schedule", data.get("weeklySchedule", {})))
    holidays = deepcopy(data.get("holidays", []))
    validate_business_hours(
        timezone_name=timezone_name,
        weekly_schedule=weekly_schedule,
        holidays=holidays,
    )
    hours, _created = ChannelBusinessHours.objects.update_or_create(
        channel=channel,
        defaults={
            "organization": channel.organization,
            "timezone": timezone_name,
            "weekly_schedule": weekly_schedule,
            "holidays": holidays,
        },
    )
    return hours


def list_rules(*, channel: Channel) -> list[ChannelRoutingRule]:
    return list(
        ChannelRoutingRule.objects.filter(
            channel=channel,
            organization_id=channel.organization_id,
        )
        .select_related("target_group")
        .order_by("priority", "id")
    )


def get_rule(*, channel: Channel, rule_id: int) -> ChannelRoutingRule:
    return ChannelRoutingRule.objects.select_related("target_group").get(
        id=rule_id,
        channel=channel,
        organization_id=channel.organization_id,
    )


@transaction.atomic
def create_rule(
    *, context: TenantContext, channel: Channel, data: dict[str, Any]
) -> ChannelRoutingRule:
    require_channel_manage(context)
    values = _rule_values(
        data,
        current=None,
        organization_id=context.organization_id,
    )
    rule = ChannelRoutingRule(organization=channel.organization, channel=channel, **values)
    rule.full_clean()
    rule.save()
    return ChannelRoutingRule.objects.select_related("target_group").get(pk=rule.pk)


@transaction.atomic
def update_rule(
    *,
    context: TenantContext,
    channel: Channel,
    rule_id: int,
    data: dict[str, Any],
) -> ChannelRoutingRule:
    require_channel_manage(context)
    try:
        rule = (
            ChannelRoutingRule.objects.select_for_update()
            .select_related("target_group")
            .get(
                id=rule_id,
                channel=channel,
                organization_id=channel.organization_id,
            )
        )
    except ChannelRoutingRule.DoesNotExist as error:
        raise ChannelRoutingRule.DoesNotExist from error
    values = _rule_values(
        data,
        current=rule,
        organization_id=context.organization_id,
    )
    for name, value in values.items():
        setattr(rule, name, value)
    rule.full_clean()
    rule.save()
    return ChannelRoutingRule.objects.select_related("target_group").get(pk=rule.pk)


@transaction.atomic
def delete_rule(
    *, context: TenantContext, channel: Channel, rule_id: int
) -> None:
    require_channel_manage(context)
    try:
        rule = ChannelRoutingRule.objects.get(
            id=rule_id,
            channel=channel,
            organization_id=channel.organization_id,
        )
    except ChannelRoutingRule.DoesNotExist as error:
        raise ChannelRoutingRule.DoesNotExist from error
    rule.delete()


@transaction.atomic
def reorder_rules(
    *, context: TenantContext, channel: Channel, rule_ids: Any
) -> int:
    """Назначает приоритеты 10, 20, 30 в порядке drag-and-drop."""

    require_channel_manage(context)
    if (
        not isinstance(rule_ids, list)
        or not rule_ids
        or len(rule_ids) > 100
        or any(isinstance(item, bool) or not isinstance(item, int) for item in rule_ids)
        or len(set(rule_ids)) != len(rule_ids)
    ):
        raise ValidationError({"rule_ids": "Ожидается список уникальных идентификаторов"})
    rules = list(
        ChannelRoutingRule.objects.select_for_update().filter(
            channel=channel,
            organization_id=channel.organization_id,
        )
    )
    by_id = {rule.pk: rule for rule in rules}
    if set(rule_ids) != set(by_id):
        raise ValidationError({"rule_ids": "Список должен содержать все правила канала"})
    for index, rule_id in enumerate(rule_ids, start=1):
        rule = by_id[rule_id]
        rule.priority = index * 10
        rule.save(update_fields=["priority", "updated_at"])
    return len(rule_ids)


def _required_string(data: dict[str, Any], key: str, alias: str) -> str:
    value = data.get(key, data.get(alias))
    if not isinstance(value, str) or not value.strip():
        raise ValidationError({key: "Нужна непустая строка"})
    return value.strip()


def _rule_values(
    data: dict[str, Any],
    *,
    current: ChannelRoutingRule | None,
    organization_id: int,
) -> dict[str, Any]:
    values: dict[str, Any] = {}
    name = data.get("name", getattr(current, "name", None))
    if not isinstance(name, str) or not name.strip():
        raise ValidationError({"name": "Укажите название правила"})
    values["name"] = name.strip()
    if len(values["name"]) > 255:
        raise ValidationError({"name": "Название правила длиннее 255 символов"})

    description = data.get("description", getattr(current, "description", ""))
    if not isinstance(description, str):
        raise ValidationError({"description": "Ожидается строка"})
    values["description"] = description.strip()

    priority = data.get("priority", getattr(current, "priority", 100))
    if (
        isinstance(priority, bool)
        or not isinstance(priority, int)
        or not 1 <= priority <= 1000
    ):
        raise ValidationError({"priority": "Приоритет должен быть от 1 до 1000"})
    values["priority"] = priority

    is_active = data.get(
        "is_active",
        data.get("isActive", getattr(current, "is_active", True)),
    )
    if not isinstance(is_active, bool):
        raise ValidationError({"is_active": "Ожидается логическое значение"})
    values["is_active"] = is_active

    trigger = data.get(
        "trigger_event",
        data.get(
            "triggerEvent",
            getattr(current, "trigger_event", RuleTriggerEvent.CONVERSATION_CREATED),
        ),
    )
    try:
        values["trigger_event"] = RuleTriggerEvent(str(trigger))
    except (TypeError, ValueError) as error:
        raise ValidationError({"trigger_event": "Неизвестное событие запуска"}) from error

    conditions = data.get("conditions", getattr(current, "conditions", {}))
    if (
        isinstance(conditions, dict)
        and set(conditions) in ({"all"}, {"any"})
        and conditions.get(next(iter(conditions))) == []
    ):
        conditions = {}
    try:
        validate_conditions(conditions)
    except InvalidRuleCondition as error:
        raise ValidationError({"conditions": str(error)}) from error
    values["conditions"] = deepcopy(conditions)

    action = data.get(
        "action_target",
        data.get(
            "actionTarget",
            getattr(current, "action_target", RuleActionTarget.ROUTE_TO_AI),
        ),
    )
    try:
        action = RuleActionTarget(str(action))
    except (TypeError, ValueError) as error:
        raise ValidationError({"action_target": "Неизвестное действие маршрутизации"}) from error
    values["action_target"] = action

    target_group_id = data.get(
        "target_group_id",
        data.get(
            "targetGroupId",
            data.get("target_group", getattr(current, "target_group_id", None)),
        ),
    )
    if target_group_id is not None:
        if isinstance(target_group_id, bool) or not isinstance(target_group_id, int):
            raise ValidationError({"target_group_id": "Ожидается идентификатор группы"})
        if not EmployeeGroup.objects.filter(
            id=target_group_id,
            organization_id=organization_id,
        ).exists():
            raise ValidationError({"target_group_id": "Группа не найдена в этой организации"})
    if action == RuleActionTarget.ASSIGN_GROUP and target_group_id is None:
        raise ValidationError({"target_group_id": "Для назначения группы укажите группу"})
    values["target_group_id"] = target_group_id
    return values
