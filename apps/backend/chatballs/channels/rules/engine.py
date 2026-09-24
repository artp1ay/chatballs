"""Фасад выбора маршрута по режиму канала и правилам."""

from __future__ import annotations

import logging
from collections.abc import Iterable
from dataclasses import replace

from chatballs.channels.models import (
    Channel,
    ChannelBusinessHours,
    ChannelRoutingMode,
    ChannelRoutingRule,
    RuleActionTarget,
    RuleTriggerEvent,
)
from chatballs.channels.rules.context import RoutingContext
from chatballs.channels.rules.evaluator import ConditionEvaluationError, evaluate_conditions
from chatballs.channels.rules.types import RouteDecision

logger = logging.getLogger(__name__)


def evaluate_routing(
    context: RoutingContext,
    *,
    trigger_event: str | None = None,
    rules: Iterable[ChannelRoutingRule] | None = None,
) -> RouteDecision:
    """Возвращает первое подходящее правило или безопасный маршрут операторам."""

    mode = getattr(context.channel, "routing_mode", ChannelRoutingMode.AI_FIRST)
    if mode == ChannelRoutingMode.HUMAN_ONLY:
        return RouteDecision(RuleActionTarget.ROUTE_TO_HUMAN, reason="human_only")
    if mode == ChannelRoutingMode.AI_FIRST:
        if context.has_active_ai_agent:
            return RouteDecision(RuleActionTarget.ROUTE_TO_AI, reason="ai_first")
        return RouteDecision(RuleActionTarget.ROUTE_TO_HUMAN, reason="ai_unavailable")
    if mode != ChannelRoutingMode.RULE_BASED:
        logger.warning("Неизвестный режим маршрутизации канала %r", mode)
        return RouteDecision(RuleActionTarget.ROUTE_TO_HUMAN, reason="invalid_mode")

    routing_context = _with_business_hours(context)
    trigger = _trigger_event(context, trigger_event)
    candidates = (
        sorted(
            rules,
            key=lambda rule: (getattr(rule, "priority", 100), getattr(rule, "pk", 0) or 0),
        )
        if rules is not None
        else _active_rules(context, trigger)
    )
    for rule in candidates:
        if getattr(rule, "trigger_event", trigger) != trigger:
            continue
        try:
            matched = evaluate_conditions(rule.conditions, routing_context)
        except ConditionEvaluationError:
            logger.warning(
                "Некорректное правило %s канала %s пропущено",
                rule.pk,
                context.channel.pk,
            )
            continue
        if matched:
            return _decision_for_rule(rule, context)
    return RouteDecision(RuleActionTarget.ROUTE_TO_HUMAN, reason="fallback")


def evaluate_channel_routing(
    context: RoutingContext,
    *,
    trigger_event: str | None = None,
    rules: Iterable[ChannelRoutingRule] | None = None,
) -> RouteDecision:
    """Совместимое имя фасада из архитектурной спецификации."""

    return evaluate_routing(context, trigger_event=trigger_event, rules=rules)


def _active_rules(
    context: RoutingContext, trigger: RuleTriggerEvent
) -> Iterable[ChannelRoutingRule]:
    channel_id = getattr(context.channel, "pk", None)
    organization_id = getattr(context.channel, "organization_id", None)
    if channel_id is None or organization_id is None:
        return ()
    return (
        ChannelRoutingRule.objects.filter(
            organization_id=organization_id,
            channel_id=channel_id,
            is_active=True,
            trigger_event=trigger,
        )
        .select_related("target_group")
        .order_by("priority", "pk")
    )


def _with_business_hours(context: RoutingContext) -> RoutingContext:
    if context.business_hours is not None or not isinstance(context.channel, Channel):
        return context
    try:
        hours = ChannelBusinessHours.objects.only(
            "channel_id",
            "organization_id",
            "timezone",
            "weekly_schedule",
            "holidays",
        ).get(
            organization_id=context.channel.organization_id,
            channel_id=context.channel.pk,
        )
    except ChannelBusinessHours.DoesNotExist:
        return context
    return replace(context, business_hours=hours)


def _trigger_event(
    context: RoutingContext, value: str | None
) -> RuleTriggerEvent:
    if value is not None:
        try:
            return RuleTriggerEvent(value)
        except (TypeError, ValueError) as error:
            raise ValueError("Неизвестное событие запуска правила") from error
    return (
        RuleTriggerEvent.CONVERSATION_CREATED
        if context.is_new_conversation
        else RuleTriggerEvent.MESSAGE_RECEIVED
    )


def _decision_for_rule(
    rule: ChannelRoutingRule, context: RoutingContext
) -> RouteDecision:
    target_group = getattr(rule, "target_group", None)
    group_organization = getattr(target_group, "organization_id", None)
    if target_group is not None and group_organization != context.channel.organization_id:
        logger.warning("Правило %s ссылается на группу другой организации", rule.pk)
        return RouteDecision(RuleActionTarget.ROUTE_TO_HUMAN, reason="invalid_group")
    try:
        target = RuleActionTarget(rule.action_target)
    except (TypeError, ValueError):
        logger.warning("Правило %s содержит неизвестное действие", rule.pk)
        return RouteDecision(RuleActionTarget.ROUTE_TO_HUMAN, reason="invalid_action")
    if target == RuleActionTarget.ROUTE_TO_AI and not context.has_active_ai_agent:
        return RouteDecision(
            RuleActionTarget.ROUTE_TO_HUMAN,
            rule_id=rule.pk,
            reason="ai_unavailable",
        )
    if target == RuleActionTarget.ASSIGN_GROUP and target_group is None:
        return RouteDecision(
            RuleActionTarget.ROUTE_TO_HUMAN,
            rule_id=rule.pk,
            reason="group_deleted",
        )
    return RouteDecision(
        target=target,
        target_group_id=(
            getattr(target_group, "pk", getattr(target_group, "id", None))
            if target_group is not None
            else None
        ),
        rule_id=rule.pk,
        reason="rule",
    )


route = evaluate_routing
