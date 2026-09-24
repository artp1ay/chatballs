"""Юнит-тесты вычислителя правил и рабочего времени."""

from dataclasses import replace
from datetime import datetime
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from django.core.exceptions import ValidationError
from django.test import SimpleTestCase

from chatballs.channels.models import ChannelRoutingMode, RuleActionTarget, RuleTriggerEvent
from chatballs.channels.rules.context import RoutingContext
from chatballs.channels.rules.engine import evaluate_routing
from chatballs.channels.rules.evaluator import (
    ConditionEvaluationError,
    evaluate_conditions,
    is_working_hours,
)
from chatballs.channels.rules.validators import (
    InvalidRuleCondition,
    validate_business_hours,
    validate_conditions,
)


class RoutingRuleUnitTests(SimpleTestCase):
    def setUp(self) -> None:
        self.channel = SimpleNamespace(
            pk=7,
            organization_id=3,
            routing_mode=ChannelRoutingMode.RULE_BASED,
        )
        self.contact = SimpleNamespace(labels=["VIP", "Enterprise"])
        self.context = RoutingContext(
            channel=self.channel,
            contact=self.contact,
            conversation=None,
            inbound_message_text="У меня ЖАЛОБА на доставку",
            is_new_conversation=True,
            current_time=datetime(2026, 5, 1, 13, 0, tzinfo=ZoneInfo("UTC")),
            has_active_ai_agent=True,
            has_verified_phone=True,
            is_first_message=True,
        )

    def test_boolean_and_text_conditions(self) -> None:
        conditions = {
            "all": [
                {"field": "contact.labels", "op": "contains", "value": "vip"},
                {
                    "field": "message.text_contains",
                    "op": "contains_any",
                    "value": ["жалоба", "возврат"],
                },
                {"field": "contact.has_phone", "op": "eq", "value": True},
            ]
        }

        self.assertTrue(evaluate_conditions(conditions, self.context))

    def test_not_first_message_and_regex(self) -> None:
        self.assertFalse(
            evaluate_conditions(
                {
                    "not": {
                        "field": "conversation.is_first_message",
                        "op": "eq",
                        "value": True,
                    }
                },
                self.context,
            )
        )
        self.assertTrue(
            evaluate_conditions(
                {
                    "field": "message.regex_match",
                    "op": "regex_match",
                    "value": r"ДОГ-\d{6}",
                },
                self.context,
            )
            is False
        )
        regex_context = replace(
            self.context,
            inbound_message_text="Номер заказа ДОГ-123456",
        )
        self.assertTrue(
            evaluate_conditions(
                {
                    "field": "message.regex_match",
                    "op": "regex_match",
                    "value": r"ДОГ-\d{6}",
                },
                regex_context,
            )
        )

    def test_invalid_regex_fails_closed(self) -> None:
        with self.assertRaises(ConditionEvaluationError):
            evaluate_conditions(
                {
                    "field": "message.regex_match",
                    "op": "regex_match",
                    "value": "[",
                },
                self.context,
            )

    def test_working_hours_use_schedule_timezone_and_holidays(self) -> None:
        business_hours = SimpleNamespace(
            timezone="Europe/Moscow",
            weekly_schedule={"fri": [{"start": "09:00", "end": "18:00"}]},
            holidays=[],
        )
        context = RoutingContext(
            channel=self.channel,
            contact=self.contact,
            conversation=None,
            inbound_message_text="",
            is_new_conversation=True,
            current_time=datetime(2026, 5, 1, 13, 0, tzinfo=ZoneInfo("UTC")),
            has_active_ai_agent=True,
            business_hours=business_hours,
        )
        self.assertTrue(is_working_hours(context))

        business_hours.holidays = ["2026-05-01"]
        self.assertFalse(is_working_hours(context))

    def test_missing_schedule_is_closed(self) -> None:
        context = RoutingContext(
            channel=self.channel,
            contact=self.contact,
            conversation=None,
            inbound_message_text="",
            is_new_conversation=True,
            current_time=datetime(2026, 5, 1, 13, 0, tzinfo=ZoneInfo("UTC")),
            has_active_ai_agent=True,
        )
        self.assertFalse(is_working_hours(context))

    def test_empty_schedule_is_closed(self) -> None:
        context = RoutingContext(
            channel=self.channel,
            contact=self.contact,
            conversation=None,
            inbound_message_text="",
            is_new_conversation=True,
            current_time=datetime(2026, 5, 1, 13, 0, tzinfo=ZoneInfo("UTC")),
            has_active_ai_agent=True,
            business_hours=SimpleNamespace(
                timezone="UTC",
                weekly_schedule={},
                holidays=[],
            ),
        )
        self.assertFalse(is_working_hours(context))

    def test_business_hours_validation_rejects_overlap(self) -> None:
        with self.assertRaises(ValidationError):
            validate_business_hours(
                timezone_name="UTC",
                weekly_schedule={
                    "mon": [
                        {"start": "09:00", "end": "13:00"},
                        {"start": "12:00", "end": "18:00"},
                    ]
                },
                holidays=[],
            )

    def test_business_hours_validation_rejects_invalid_date(self) -> None:
        with self.assertRaises(ValidationError):
            validate_business_hours(
                timezone_name="UTC",
                weekly_schedule={},
                holidays=["01.05.2026"],
            )

    def test_condition_validation_rejects_unknown_field(self) -> None:
        with self.assertRaises(InvalidRuleCondition):
            validate_conditions(
                {"field": "contact.unknown", "op": "eq", "value": True}
            )

    def test_first_matching_rule_wins(self) -> None:
        first = SimpleNamespace(
            pk=10,
            trigger_event=RuleTriggerEvent.CONVERSATION_CREATED,
            conditions={"field": "message.text_contains", "op": "contains", "value": "жалоба"},
            action_target=RuleActionTarget.ROUTE_TO_AI,
            target_group_id=None,
            target_group=None,
        )
        second = SimpleNamespace(
            pk=20,
            trigger_event=RuleTriggerEvent.CONVERSATION_CREATED,
            conditions={},
            action_target=RuleActionTarget.ROUTE_TO_HUMAN,
            target_group_id=None,
            target_group=None,
        )

        decision = evaluate_routing(self.context, rules=[first, second])

        self.assertEqual(decision.target, RuleActionTarget.ROUTE_TO_AI)
        self.assertEqual(decision.rule_id, 10)

    def test_ai_rule_without_agent_falls_back_to_human(self) -> None:
        rule = SimpleNamespace(
            pk=11,
            trigger_event=RuleTriggerEvent.CONVERSATION_CREATED,
            conditions={},
            action_target=RuleActionTarget.ROUTE_TO_AI,
            target_group_id=None,
            target_group=None,
        )
        context = RoutingContext(
            channel=self.channel,
            contact=self.contact,
            conversation=None,
            inbound_message_text="",
            is_new_conversation=True,
            current_time=datetime(2026, 5, 1, 13, 0, tzinfo=ZoneInfo("UTC")),
            has_active_ai_agent=False,
        )

        decision = evaluate_routing(context, rules=[rule])

        self.assertEqual(decision.target, RuleActionTarget.ROUTE_TO_HUMAN)
        self.assertEqual(decision.reason, "ai_unavailable")
