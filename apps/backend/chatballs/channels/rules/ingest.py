"""Связка Rules Engine с приёмом входящего сообщения."""

from __future__ import annotations

from datetime import datetime

from chatballs.channels.models import Channel, RuleActionTarget
from chatballs.channels.rules.actions import apply_routing_decision
from chatballs.channels.rules.context import RoutingContext
from chatballs.channels.rules.engine import evaluate_routing
from chatballs.channels.rules.types import RouteDecision
from chatballs.conversations.models import Contact, ControlMode, Conversation


def route_inbound_conversation(
    *,
    channel: Channel,
    contact: Contact,
    conversation: Conversation,
    inbound_message_text: str,
    is_new_conversation: bool,
    is_first_message: bool,
    has_verified_phone: bool,
    current_time: datetime,
    has_active_ai_agent: bool | None = None,
) -> RouteDecision:
    """Вычисляет и применяет маршрут в уже сохранённом диалоге."""

    if has_active_ai_agent is None:
        agent = getattr(channel, "ai_agent", None)
        has_active_ai_agent = bool(agent and agent.is_active)
    if conversation.control_mode == ControlMode.HUMAN:
        return None
    context = RoutingContext(
        channel=channel,
        contact=contact,
        conversation=conversation,
        inbound_message_text=inbound_message_text,
        is_new_conversation=is_new_conversation,
        current_time=current_time,
        has_active_ai_agent=has_active_ai_agent,
        has_verified_phone=has_verified_phone,
        is_first_message=is_first_message,
    )
    decision = evaluate_routing(context)
    if (
        conversation.control_mode == ControlMode.HUMAN
        and decision.target != RuleActionTarget.DROP_SILENTLY
    ):
        return decision
    fields = apply_routing_decision(
        conversation,
        decision,
        channel=channel,
        now=current_time,
    )
    if fields:
        conversation.save(update_fields=fields)
    return decision


route_inbound = route_inbound_conversation
