"""Применение решения маршрутизации к диалогу."""

from __future__ import annotations

from datetime import datetime

from django.utils import timezone

from chatballs.channels.models import Channel, RuleActionTarget
from chatballs.channels.rules.types import RouteDecision
from chatballs.conversations.models import (
    ControlMode,
    Conversation,
    ExpectedResponder,
    LifecycleState,
)
from chatballs.conversations.queue import enter_queue, leave_queue

QUEUE_FIELDS = ("control_mode", "expected_responder", "waiting_since")


def apply_routing_decision(
    conversation: Conversation,
    decision: RouteDecision,
    *,
    channel: Channel | None = None,
    now: datetime | None = None,
) -> tuple[str, ...]:
    """Меняет поля маршрутизации и возвращает их для одного save()."""

    target = RuleActionTarget(decision.target)
    if (
        conversation.control_mode == ControlMode.HUMAN
        and target != RuleActionTarget.DROP_SILENTLY
    ):
        return ()
    channel = channel or conversation.channel
    now = now or timezone.now()
    if target == RuleActionTarget.ROUTE_TO_AI:
        agent = getattr(channel, "ai_agent", None)
        if agent is None or not agent.is_active:
            target = RuleActionTarget.ROUTE_TO_HUMAN

    if target in {
        RuleActionTarget.ROUTE_TO_HUMAN,
        RuleActionTarget.ASSIGN_GROUP,
    }:
        enter_queue(conversation, now=now)
        conversation.group_id = (
            decision.target_group_id
            if target == RuleActionTarget.ASSIGN_GROUP
            else channel.group_id
        )
        return (*QUEUE_FIELDS, "group")

    if target == RuleActionTarget.ROUTE_TO_AI:
        leave_queue(conversation)
        conversation.control_mode = ControlMode.AI
        conversation.expected_responder = ExpectedResponder.AI
        conversation.assigned_operator = None
        conversation.assigned_at = None
        return (*QUEUE_FIELDS, "assigned_operator", "assigned_at")

    if target == RuleActionTarget.DROP_SILENTLY:
        leave_queue(conversation)
        conversation.lifecycle = LifecycleState.SPAM
        conversation.control_mode = ControlMode.PAUSED
        conversation.expected_responder = ExpectedResponder.NOBODY
        conversation.assigned_operator = None
        conversation.assigned_at = None
        return ("lifecycle", *QUEUE_FIELDS, "assigned_operator", "assigned_at")

    raise ValueError("Неизвестное действие маршрутизации.")


def apply_route_decision(
    *,
    conversation: Conversation,
    decision: RouteDecision,
    channel: Channel | None = None,
    now: datetime | None = None,
) -> Conversation:
    """Совместимый фасад, который сохраняет решение сразу."""

    fields = apply_routing_decision(
        conversation,
        decision,
        channel=channel,
        now=now,
    )
    if fields:
        conversation.save(update_fields=fields)
    return conversation


apply_decision = apply_route_decision
