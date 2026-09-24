"""Интеграционные тесты переходов при новых сообщениях."""

from datetime import UTC, datetime, timedelta
from unittest import mock

from django.utils import timezone

from chatballs.channels.models import (
    ChannelBusinessHours,
    ChannelRoutingMode,
    ChannelRoutingRule,
    RuleActionTarget,
    RuleTriggerEvent,
)
from chatballs.conversations.ingest import ingest_inbound
from chatballs.conversations.models import (
    ConnectionIdentity,
    Contact,
    ControlMode,
    Conversation,
    ExpectedResponder,
)
from chatballs.conversations.routing_test_base import RoutingTestCase


class FlexibleRoutingTransitionTests(RoutingTestCase):
    def test_existing_queue_keeps_original_waiting_since(self) -> None:
        self._set_mode(ChannelRoutingMode.RULE_BASED)
        contact = Contact.objects.create(
            organization=self.organization,
            name="Клиент",
        )
        ConnectionIdentity.objects.create(
            contact=contact,
            connection=self.integration,
            external_user_id="existing-user",
        )
        waiting_since = timezone.now() - timedelta(minutes=10)
        Conversation.objects.create(
            organization=self.organization,
            channel=self.channel,
            connection=self.integration,
            contact=contact,
            control_mode=ControlMode.PAUSED,
            expected_responder=ExpectedResponder.OPERATOR,
            waiting_since=waiting_since,
        )

        with (
            mock.patch("chatballs.conversations.ingest.request_ai_turn") as request_ai,
            mock.patch("chatballs.conversations.inbound_notifications.notify"),
        ):
            ingest_inbound(
                self.integration,
                self._inbound(
                    external_id="routing-existing",
                    user_id="existing-user",
                ),
            )

        conversation = self.channel.conversations.get()
        self.assertEqual(conversation.waiting_since, waiting_since)
        request_ai.assert_not_called()

    def test_message_received_rule_can_move_ai_dialog_to_human(self) -> None:
        self._create_agent()
        with (
            mock.patch("chatballs.conversations.ingest.request_ai_turn"),
            mock.patch("chatballs.conversations.inbound_notifications.notify"),
        ):
            ingest_inbound(
                self.integration,
                self._inbound(external_id="first", text="Обычный вопрос"),
            )

        self._set_mode(ChannelRoutingMode.RULE_BASED)
        ChannelRoutingRule.objects.create(
            organization=self.organization,
            channel=self.channel,
            name="Оператор по запросу клиента",
            trigger_event=RuleTriggerEvent.MESSAGE_RECEIVED,
            conditions={
                "field": "message.text_contains",
                "op": "contains",
                "value": "оператор",
            },
            action_target=RuleActionTarget.ROUTE_TO_HUMAN,
        )

        with (
            mock.patch("chatballs.conversations.ingest.request_ai_turn") as request_ai,
            mock.patch("chatballs.conversations.inbound_notifications.notify"),
        ):
            ingest_inbound(
                self.integration,
                self._inbound(external_id="second", text="Позови оператора"),
            )

        conversation = self.channel.conversations.get()
        self.assertEqual(conversation.control_mode, ControlMode.PAUSED)
        request_ai.assert_not_called()

    def test_manual_operator_control_is_not_overridden(self) -> None:
        self._set_mode(ChannelRoutingMode.RULE_BASED)
        self._create_agent()
        ChannelRoutingRule.objects.create(
            organization=self.organization,
            channel=self.channel,
            name="Все обращения в AI",
            conditions={},
            action_target=RuleActionTarget.ROUTE_TO_AI,
        )
        contact = Contact.objects.create(organization=self.organization, name="Клиент")
        ConnectionIdentity.objects.create(
            contact=contact,
            connection=self.integration,
            external_user_id="manual-user",
        )
        Conversation.objects.create(
            organization=self.organization,
            channel=self.channel,
            connection=self.integration,
            contact=contact,
            control_mode=ControlMode.HUMAN,
            expected_responder=ExpectedResponder.NOBODY,
        )

        with (
            mock.patch("chatballs.conversations.ingest.request_ai_turn") as request_ai,
            mock.patch("chatballs.conversations.inbound_notifications.notify"),
        ):
            ingest_inbound(
                self.integration,
                self._inbound(
                    external_id="manual-message",
                    user_id="manual-user",
                ),
            )

        conversation = self.channel.conversations.get()
        self.assertEqual(conversation.control_mode, ControlMode.HUMAN)
        request_ai.assert_not_called()

    def test_schedule_rule_uses_business_hours(self) -> None:
        self._set_mode(ChannelRoutingMode.RULE_BASED)
        ChannelBusinessHours.objects.create(
            organization=self.organization,
            channel=self.channel,
            timezone="UTC",
            weekly_schedule={"tue": [{"start": "09:00", "end": "18:00"}]},
        )
        ChannelRoutingRule.objects.create(
            organization=self.organization,
            channel=self.channel,
            name="Днём оператор",
            conditions={
                "field": "schedule.is_working_hours",
                "op": "eq",
                "value": True,
            },
            action_target=RuleActionTarget.ROUTE_TO_HUMAN,
        )
        received_at = datetime(2026, 5, 5, 10, 0, tzinfo=UTC)

        with (
            mock.patch(
                "chatballs.conversations.ingest.timezone.now",
                return_value=received_at,
            ),
            mock.patch("chatballs.conversations.ingest.request_ai_turn") as request_ai,
            mock.patch("chatballs.conversations.inbound_notifications.notify"),
        ):
            ingest_inbound(self.integration, self._inbound())

        conversation = self.channel.conversations.get()
        self.assertEqual(conversation.control_mode, ControlMode.PAUSED)
        request_ai.assert_not_called()
