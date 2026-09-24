"""Контекст предикатов маршрутизации."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import TYPE_CHECKING
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from chatballs.channels.rules.validators import DAY_KEYS

if TYPE_CHECKING:
    from chatballs.channels.models import Channel, ChannelBusinessHours
    from chatballs.conversations.models import Contact, Conversation

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class RoutingContext:
    """Факты одного входящего события, необходимые движку правил."""

    channel: Channel
    contact: Contact
    conversation: Conversation | None
    inbound_message_text: str
    is_new_conversation: bool
    current_time: datetime
    has_active_ai_agent: bool
    has_verified_phone: bool = False
    contact_labels: tuple[str, ...] = ()
    is_first_message: bool = False
    business_hours: ChannelBusinessHours | None = None
    is_first_contact_message: bool | None = None

    def __post_init__(self) -> None:
        # Поддержаны оба имени поля: ingest и ранние черновики используют короткое,
        # а архитектурный контракт — полное имя.
        if self.is_first_contact_message is None:
            object.__setattr__(self, "is_first_contact_message", self.is_first_message)
        else:
            object.__setattr__(self, "is_first_message", self.is_first_contact_message)

    @property
    def labels(self) -> tuple[str, ...]:
        raw_labels = self.contact_labels or getattr(self.contact, "labels", ())
        if isinstance(raw_labels, str):
            raw_labels = (raw_labels,)
        if not isinstance(raw_labels, list | tuple | set):
            return ()
        return tuple(
            label.strip().casefold()
            for label in raw_labels
            if isinstance(label, str) and label.strip()
        )

    @property
    def is_working_hours(self) -> bool:
        hours = self.business_hours
        if hours is None:
            logger.warning(
                "Для канала %s не настроено расписание; рабочее время закрыто",
                self.channel.pk,
            )
            return False
        current = self.current_time
        if current.tzinfo is None:
            current = current.replace(tzinfo=UTC)
        try:
            local_now = current.astimezone(ZoneInfo(hours.timezone))
        except (ZoneInfoNotFoundError, TypeError, ValueError):
            logger.warning("Неизвестный часовой пояс %r", hours.timezone)
            return False
        holidays = hours.holidays if isinstance(hours.holidays, list) else []
        if local_now.date().isoformat() in holidays:
            return False
        schedule = hours.weekly_schedule
        if not isinstance(schedule, dict):
            return False
        # Запись с пустым расписанием означает круглосуточную доступность.
        # Отсутствие самой записи обрабатывается выше как «не настроено».
        if not schedule:
            return True
        intervals = schedule.get(DAY_KEYS[local_now.weekday()])
        current_minutes = local_now.hour * 60 + local_now.minute
        if isinstance(intervals, list) and any(
            _contains(interval, current_minutes) for interval in intervals
        ):
            return True
        previous_key = DAY_KEYS[(local_now.weekday() - 1) % 7]
        previous_intervals = schedule.get(previous_key)
        return isinstance(previous_intervals, list) and any(
            _contains_overnight(interval, current_minutes)
            for interval in previous_intervals
        )


def _contains(interval: object, current_minutes: int) -> bool:
    if not isinstance(interval, dict):
        return False
    start = _minutes(interval.get("start"))
    end = _minutes(interval.get("end"))
    if start is None or end is None or start >= end:
        return False
    return start <= current_minutes < end


def _contains_overnight(interval: object, current_minutes: int) -> bool:
    if not isinstance(interval, dict):
        return False
    start = _minutes(interval.get("start"))
    end = _minutes(interval.get("end"))
    if start is None or end is None or start <= end:
        return False
    return current_minutes < end


def _minutes(value: object) -> int | None:
    if not isinstance(value, str):
        return None
    try:
        hours_text, minutes_text = value.split(":", maxsplit=1)
        hours = int(hours_text)
        minutes = int(minutes_text)
    except (TypeError, ValueError):
        return None
    if len(hours_text) != 2 or len(minutes_text) != 2:
        return None
    if not 0 <= hours <= 23 or not 0 <= minutes <= 59:
        return None
    return hours * 60 + minutes


def normalized_now() -> datetime:
    from django.utils import timezone

    now = timezone.now()
    return now if now.tzinfo is not None else now.replace(tzinfo=UTC)
