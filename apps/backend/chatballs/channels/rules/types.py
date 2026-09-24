"""Тип решения маршрутизации."""

from __future__ import annotations

from dataclasses import dataclass

from chatballs.channels.models import RuleActionTarget


@dataclass(frozen=True, slots=True)
class RouteDecision:
    target: RuleActionTarget
    target_group_id: int | None = None
    rule_id: int | None = None
    reason: str = "fallback"

    def __post_init__(self) -> None:
        object.__setattr__(self, "target", RuleActionTarget(self.target))

    @property
    def target_group(self) -> int | None:
        return self.target_group_id

    @property
    def matched_rule_id(self) -> int | None:
        return self.rule_id
