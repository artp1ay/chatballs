"""Валидация условий правил и расписания канала."""

from __future__ import annotations

import re
from datetime import date, time
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.core.exceptions import ValidationError

from chatballs.channels.models import ChannelRoutingMode


class InvalidRuleCondition(ValidationError):
    """Условие правила нельзя безопасно сохранить или вычислить."""


MAX_DEPTH = 5
MAX_NODES = 50
MAX_BRANCH = 25
MAX_REGEX_LENGTH = 256
MAX_TEXT_LENGTH = 1_000
MAX_HOLIDAYS = 3_660
DAY_KEYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
_TIME_RE = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")
FIELD_OPERATORS: dict[str, frozenset[str]] = {
    "schedule.is_working_hours": frozenset({"eq", "neq"}),
    "channel.routing_mode": frozenset({"eq", "neq"}),
    "contact.has_phone": frozenset({"eq", "neq"}),
    "contact.labels": frozenset(
        {"contains", "not_contains", "contains_any", "contains_all"}
    ),
    "message.text_contains": frozenset(
        {"contains", "not_contains", "contains_any", "contains_all"}
    ),
    "message.regex_match": frozenset({"regex", "regex_match"}),
    "conversation.is_first_message": frozenset({"eq", "neq"}),
}
LOGICAL_KEYS = frozenset({"all", "any", "not"})
LEAF_KEYS = frozenset({"field", "op", "value"})


def validate_conditions(value: Any, *, field: str = "conditions") -> None:
    """Проверяет JSON-дерево до сохранения и перед вычислением."""

    _validate_node(value, field=field, depth=0, nodes=[0])


def validate_business_hours(
    *, timezone_name: Any, weekly_schedule: Any, holidays: Any
) -> None:
    """Проверяет IANA-зону, недельные интервалы и даты исключений."""

    errors: dict[str, str] = {}
    _validate_timezone(timezone_name, errors)
    _validate_schedule(weekly_schedule, errors)
    _validate_holidays(holidays, errors)
    if errors:
        raise InvalidRuleCondition(errors)


def _validate_timezone(value: Any, errors: dict[str, str]) -> None:
    if not isinstance(value, str) or not value.strip():
        errors["timezone"] = "Укажите часовой пояс."
        return
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, TypeError, ValueError):
        errors["timezone"] = "Укажите корректный часовой пояс IANA."


def _validate_schedule(value: Any, errors: dict[str, str]) -> None:
    if not isinstance(value, dict):
        errors["weekly_schedule"] = "График должен быть объектом с днями недели."
        return
    if set(value) - set(DAY_KEYS):
        errors["weekly_schedule"] = "График содержит неизвестный день недели."
        return
    total = 0
    for day, intervals in value.items():
        if not isinstance(intervals, list) or len(intervals) > 4:
            errors["weekly_schedule"] = f"График дня «{day}» задан неверно."
            return
        total += len(intervals)
        segments: list[tuple[int, int]] = []
        for index, interval in enumerate(intervals):
            if not isinstance(interval, dict) or set(interval) != {"start", "end"}:
                errors["weekly_schedule"] = f"Интервал {day}[{index}] задан неверно."
                return
            start, end = interval["start"], interval["end"]
            if not (
                isinstance(start, str)
                and isinstance(end, str)
                and _TIME_RE.fullmatch(start)
                and _TIME_RE.fullmatch(end)
            ):
                errors["weekly_schedule"] = (
                    f"Интервал {day}[{index}] должен содержать время ЧЧ:ММ."
                )
                return
            start_minutes = _minutes(start)
            end_minutes = _minutes(end)
            if start_minutes == end_minutes:
                errors["weekly_schedule"] = (
                    f"В интервале {day}[{index}] начало и конец совпадают."
                )
                return
            if start_minutes < end_minutes:
                segments.append((start_minutes, end_minutes))
            else:
                segments.extend(((start_minutes, 1_440), (0, end_minutes)))
        segments.sort()
        if any(
            left[1] > right[0]
            for left, right in zip(segments, segments[1:], strict=False)
        ):
            errors["weekly_schedule"] = f"Интервалы дня «{day}» пересекаются."
            return
    if total > 28:
        errors["weekly_schedule"] = "Допускается не более 28 интервалов в неделю."


def _validate_holidays(value: Any, errors: dict[str, str]) -> None:
    if not isinstance(value, list) or len(value) > MAX_HOLIDAYS:
        errors["holidays"] = "Праздничные дни должны быть списком дат."
        return
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, str) or item in seen:
            errors["holidays"] = "Праздничные дни должны быть уникальными строками."
            return
        try:
            date.fromisoformat(item)
        except ValueError:
            errors["holidays"] = "Дата должна быть в формате ГГГГ-ММ-ДД."
            return
        seen.add(item)


def _minutes(value: str) -> int:
    parsed = time.fromisoformat(value)
    return parsed.hour * 60 + parsed.minute


def _validate_node(value: Any, *, field: str, depth: int, nodes: list[int]) -> None:
    nodes[0] += 1
    if depth > MAX_DEPTH or nodes[0] > MAX_NODES:
        raise _error(field, "Дерево условий слишком сложное.")
    if not isinstance(value, dict):
        raise _error(field, "Условие должно быть объектом.")
    keys = set(value)
    logical = keys & LOGICAL_KEYS
    if logical:
        if len(keys) != 1:
            raise _error(field, "Логический блок нельзя смешивать с другими полями.")
        operator = next(iter(logical))
        nested = value[operator]
        if operator in {"all", "any"}:
            if not isinstance(nested, list) or not nested or len(nested) > MAX_BRANCH:
                raise _error(field, "Логический блок должен содержать список.")
            for item in nested:
                _validate_node(item, field=field, depth=depth + 1, nodes=nodes)
        else:
            _validate_node(nested, field=field, depth=depth + 1, nodes=nodes)
        return
    if not keys:
        return
    if keys != LEAF_KEYS:
        raise _error(field, "Лист условия должен содержать field, op и value.")
    field_name, operator, expected = value["field"], value["op"], value["value"]
    if not isinstance(field_name, str) or field_name not in FIELD_OPERATORS:
        raise _error(field, "Неизвестный предикат правила.")
    if not isinstance(operator, str) or operator not in FIELD_OPERATORS[field_name]:
        raise _error(field, "Оператор не поддерживается для выбранного предиката.")
    _validate_value(field_name, expected, field=field)


def _validate_value(field_name: str, value: Any, *, field: str) -> None:
    if field_name in {
        "schedule.is_working_hours",
        "contact.has_phone",
        "conversation.is_first_message",
    }:
        if not isinstance(value, bool):
            raise _error(field, "Для предиката требуется true или false.")
    elif field_name == "channel.routing_mode":
        if not isinstance(value, str) or value not in ChannelRoutingMode.values:
            raise _error(field, "Указан неизвестный режим маршрутизации.")
    elif field_name in {"contact.labels", "message.text_contains"}:
        values = [value] if isinstance(value, str) else value
        if (
            not isinstance(values, list)
            or not values
            or len(values) > MAX_BRANCH
            or any(
                not isinstance(item, str)
                or not item.strip()
                or len(item) > MAX_TEXT_LENGTH
                for item in values
            )
        ):
            raise _error(field, "Текстовое значение должно быть непустым.")
    elif field_name == "message.regex_match":
        if not isinstance(value, str) or not value or len(value) > MAX_REGEX_LENGTH:
            raise _error(field, "Регулярное выражение должно быть непустым и коротким.")
        try:
            re.compile(value)
        except re.error as error:
            raise _error(field, f"Некорректное регулярное выражение: {error.msg}") from error


def _error(field: str, message: str) -> InvalidRuleCondition:
    return InvalidRuleCondition({field: message})
