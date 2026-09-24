"""Представление настроек маршрутизации в API."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from chatballs.channels.models import Channel, ChannelBusinessHours, ChannelRoutingRule


def business_hours_payload(hours: ChannelBusinessHours) -> dict[str, Any]:
    return {
        "timezone": hours.timezone,
        "weekly_schedule": deepcopy(hours.weekly_schedule or {}),
        "holidays": deepcopy(hours.holidays or []),
    }


def channel_payload(channel: Channel) -> dict[str, Any]:
    return {
        "id": channel.id,
        "name": channel.name,
        "code": channel.code,
        "routing_mode": channel.routing_mode,
        "routingMode": channel.routing_mode,
    }


def rule_payload(rule: ChannelRoutingRule) -> dict[str, Any]:
    return {
        "id": rule.pk,
        "organization": rule.organization_id,
        "channel": rule.channel_id,
        "name": rule.name,
        "description": rule.description,
        "priority": rule.priority,
        "is_active": rule.is_active,
        "trigger_event": rule.trigger_event,
        "conditions": deepcopy(rule.conditions or {}),
        "action_target": rule.action_target,
        "target_group": rule.target_group_id,
        "target_group_id": rule.target_group_id,
        "target_group_name": rule.target_group.name if rule.target_group_id else None,
        "created_at": rule.created_at.isoformat(),
        "updated_at": rule.updated_at.isoformat(),
    }
