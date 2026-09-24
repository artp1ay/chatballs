"""Движок гибкой маршрутизации диалогов."""

from chatballs.channels.rules.actions import (
    apply_decision,
    apply_route_decision,
    apply_routing_decision,
)
from chatballs.channels.rules.context import RoutingContext
from chatballs.channels.rules.engine import (
    evaluate_channel_routing,
    evaluate_routing,
    route,
)
from chatballs.channels.rules.evaluator import (
    ConditionEvaluationError,
    evaluate_conditions,
    is_working_hours,
)
from chatballs.channels.rules.types import RouteDecision
from chatballs.channels.rules.validators import (
    InvalidRuleCondition,
    validate_business_hours,
    validate_conditions,
)

__all__ = [
    "ConditionEvaluationError",
    "InvalidRuleCondition",
    "RouteDecision",
    "RoutingContext",
    "apply_decision",
    "apply_route_decision",
    "apply_routing_decision",
    "evaluate_channel_routing",
    "evaluate_conditions",
    "evaluate_routing",
    "is_working_hours",
    "route",
    "validate_business_hours",
    "validate_conditions",
]
