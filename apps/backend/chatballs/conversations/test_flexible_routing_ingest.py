"""Интеграционные тесты начального выбора маршрута."""

from unittest import mock

from chatballs.channels.models import (
    ChannelRoutingMode,
    ChannelRoutingRule,
    RuleActionTarget,
)
from chatballs.conversations.ingest import ingest_inbound
from chatballs.conversations.models import ControlMode, ExpectedResponder
from chatballs.conversations.routing_test_base import RoutingTestCase
from chatballs.identity.group_models import EmployeeGroup


class FlexibleRoutingIngestTests(RoutingTestCase):
    def test_human_only_never_requests_ai(self) -> None:
        self._set_mode(ChannelRoutingMode.HUMAN_ONLY)
        self._create_agent()

        with (
            mock.patch("chatballs.conversations.ingest.request_ai_turn") as request_ai,
            mock.patch("chatballs.conversations.inbound_notifications.notify"),
        ):
            ingest_inbound(self.integration, self._inbound())

        conversation = self.channel.conversations.get()
        self.assertEqual(conversation.control_mode, ControlMode.PAUSED)
        self.assertEqual(conversation.expected_responder, ExpectedResponder.OPERATOR)
        self.assertIsNotNone(conversation.waiting_since)
        request_ai.assert_not_called()

    def test_ai_first_preserves_existing_regression(self) -> None:
        self._set_mode(ChannelRoutingMode.AI_FIRST)
        self._create_agent()

        with (
            mock.patch("chatballs.conversations.ingest.request_ai_turn") as request_ai,
            mock.patch("chatballs.conversations.inbound_notifications.notify"),
        ):
            ingest_inbound(self.integration, self._inbound())

        conversation = self.channel.conversations.get()
        self.assertEqual(conversation.control_mode, ControlMode.AI)
        self.assertEqual(conversation.expected_responder, ExpectedResponder.AI)
        request_ai.assert_called_once()

    def test_rule_matches_stop_word_and_assigns_group(self) -> None:
        self._set_mode(ChannelRoutingMode.RULE_BASED)
        group = EmployeeGroup.objects.create(
            organization=self.organization,
            name="Старшие операторы",
        )
        ChannelRoutingRule.objects.create(
            organization=self.organization,
            channel=self.channel,
            name="Жалобы оператору",
            priority=10,
            conditions={
                "field": "message.text_contains",
                "op": "contains_any",
                "value": ["жалоба", "оператор"],
            },
            action_target=RuleActionTarget.ASSIGN_GROUP,
            target_group=group,
        )

        with (
            mock.patch("chatballs.conversations.ingest.request_ai_turn") as request_ai,
            mock.patch("chatballs.conversations.inbound_notifications.notify"),
        ):
            ingest_inbound(
                self.integration,
                self._inbound(text="У меня жалоба на сервис"),
            )

        conversation = self.channel.conversations.get()
        self.assertEqual(conversation.control_mode, ControlMode.PAUSED)
        self.assertEqual(conversation.expected_responder, ExpectedResponder.OPERATOR)
        self.assertEqual(conversation.group, group)
        request_ai.assert_not_called()

    def test_ai_rule_is_used_when_agent_is_active(self) -> None:
        self._set_mode(ChannelRoutingMode.RULE_BASED)
        self._create_agent()
        ChannelRoutingRule.objects.create(
            organization=self.organization,
            channel=self.channel,
            name="Все обращения в AI",
            priority=1,
            conditions={},
            action_target=RuleActionTarget.ROUTE_TO_AI,
        )

        with (
            mock.patch("chatballs.conversations.ingest.request_ai_turn") as request_ai,
            mock.patch("chatballs.conversations.inbound_notifications.notify"),
        ):
            ingest_inbound(self.integration, self._inbound())

        conversation = self.channel.conversations.get()
        self.assertEqual(conversation.control_mode, ControlMode.AI)
        self.assertEqual(conversation.expected_responder, ExpectedResponder.AI)
        request_ai.assert_called_once()

    def test_ai_rule_without_agent_falls_back_to_queue(self) -> None:
        self._set_mode(ChannelRoutingMode.RULE_BASED)
        ChannelRoutingRule.objects.create(
            organization=self.organization,
            channel=self.channel,
            name="Попытка передать в AI",
            priority=1,
            conditions={},
            action_target=RuleActionTarget.ROUTE_TO_AI,
        )

        with (
            mock.patch("chatballs.conversations.ingest.request_ai_turn") as request_ai,
            mock.patch("chatballs.conversations.inbound_notifications.notify"),
        ):
            ingest_inbound(self.integration, self._inbound())

        conversation = self.channel.conversations.get()
        self.assertEqual(conversation.control_mode, ControlMode.PAUSED)
        self.assertEqual(conversation.expected_responder, ExpectedResponder.OPERATOR)
        request_ai.assert_not_called()

    def test_no_matching_rule_uses_human_fallback(self) -> None:
        self._set_mode(ChannelRoutingMode.RULE_BASED)
        self._create_agent()
        ChannelRoutingRule.objects.create(
            organization=self.organization,
            channel=self.channel,
            name="Другое условие",
            conditions={
                "field": "message.text_contains",
                "op": "contains",
                "value": "другое слово",
            },
            action_target=RuleActionTarget.ROUTE_TO_AI,
        )

        with (
            mock.patch("chatballs.conversations.ingest.request_ai_turn") as request_ai,
            mock.patch("chatballs.conversations.inbound_notifications.notify"),
        ):
            ingest_inbound(self.integration, self._inbound())

        conversation = self.channel.conversations.get()
        self.assertEqual(conversation.control_mode, ControlMode.PAUSED)
        self.assertEqual(conversation.expected_responder, ExpectedResponder.OPERATOR)
        request_ai.assert_not_called()
