"""Вычислитель предикатов и логических блоков."""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

from django.core.exceptions import ValidationError

from chatballs.channels.rules.context import RoutingContext
from chatballs.channels.rules.validators import (
    InvalidRuleCondition,
    validate_conditions,
)

MAX_REGEX_TEXT = 10_000


class ConditionEvaluationError(ValueError):
    """Условие нельзя безопасно вычислить."""


def evaluate_conditions(value: Any, context: RoutingContext) -> bool:
    try:
        validate_conditions(value)
    except (InvalidRuleCondition, ValidationError) as error:
        raise ConditionEvaluationError("Схема условия правила недействительна.") from error
    return _evaluate_node(value, context, depth=0)


def is_working_hours(context: RoutingContext) -> bool:
    return context.is_working_hours


def _evaluate_node(value: Any, context: RoutingContext, *, depth: int) -> bool:
    if depth > 5:
        raise ConditionEvaluationError("Слишком глубокое дерево условий.")
    if not isinstance(value, Mapping):
        raise ConditionEvaluationError("Узел условия должен быть объектом.")
    if "not" in value:
        return not _evaluate_node(value["not"], context, depth=depth + 1)
    if "all" in value:
        return all(_evaluate_node(item, context, depth=depth + 1) for item in value["all"])
    if "any" in value:
        return any(_evaluate_node(item, context, depth=depth + 1) for item in value["any"])
    if not value:
        return True
    return _compare(
        _actual_value(value.get("field"), context),
        value.get("op"),
        value.get("value"),
    )


def _actual_value(field_name: Any, context: RoutingContext) -> Any:
    if field_name == "schedule.is_working_hours":
        return is_working_hours(context)
    if field_name == "channel.routing_mode":
        return context.channel.routing_mode
    if field_name == "contact.has_phone":
        return context.has_verified_phone
    if field_name == "conversation.is_first_message":
        return context.is_first_message
    if field_name == "contact.labels":
        return context.labels
    if field_name in {"message.text_contains", "message.regex_match"}:
        return context.inbound_message_text[:MAX_REGEX_TEXT]
    raise ConditionEvaluationError("Неизвестный предикат правила.")


def _compare(actual: Any, operator: Any, expected: Any) -> bool:
    if operator == "eq":
        return _equal(actual, expected)
    if operator == "neq":
        return not _equal(actual, expected)
    if operator == "contains":
        return _contains(actual, expected)
    if operator == "not_contains":
        return not _contains(actual, expected)
    if operator in {"contains_any", "contains_all"}:
        values = [expected] if isinstance(expected, str) else list(expected)
        checks = [_contains(actual, item) for item in values]
        return any(checks) if operator == "contains_any" else all(checks)
    if operator in {"regex", "regex_match"}:
        try:
            return re.search(expected, actual) is not None
        except (re.error, TypeError) as error:
            raise ConditionEvaluationError("Регулярное выражение не выполнено.") from error
    raise ConditionEvaluationError("Неизвестный оператор правила.")


def _equal(actual: Any, expected: Any) -> bool:
    if isinstance(actual, bool) or isinstance(expected, bool):
        return type(actual) is type(expected) and actual == expected
    return actual == expected


def _contains(container: Any, expected: Any) -> bool:
    if not isinstance(expected, str):
        return False
    if isinstance(container, str):
        values = (container,)
    elif isinstance(container, Sequence):
        values = tuple(str(item) for item in container)
    else:
        return False
    needle = expected.casefold()
    return any(needle in value.casefold() for value in values)
