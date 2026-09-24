"""Общая подготовка данных для тестов гибкой маршрутизации."""

from django.test import TestCase

from chatballs.ai.models import AIAgent, AIAgentStatus
from chatballs.channels.models import Channel, ChannelRoutingMode
from chatballs.conversations.transports.base import InboundMessage
from chatballs.identity.bootstrap import bootstrap_owner
from chatballs.identity.models import Organization
from chatballs.integrations.models import Integration, IntegrationKind, IntegrationProvider


class RoutingTestCase(TestCase):
    def setUp(self) -> None:
        bootstrap_owner(email="routing-owner@example.com", password="temporary-password")
        self.organization = Organization.objects.get(slug="demo")
        self.channel = Channel.objects.create(
            organization=self.organization,
            code="routing",
            name="Маршрутизация",
        )
        self.integration = Integration.objects.create(
            organization=self.organization,
            kind=IntegrationKind.MESSENGER,
            provider=IntegrationProvider.TELEGRAM,
            name="routing-bot",
            channel=self.channel,
        )

    def _inbound(
        self,
        *,
        external_id: str = "routing-1",
        user_id: str = "routing-user-1",
        text: str = "Нужно поговорить с оператором",
    ) -> InboundMessage:
        return InboundMessage(
            external_id=external_id,
            user_id=user_id,
            chat_id="routing-chat-1",
            text=text,
            display_name="Гость",
        )

    def _set_mode(self, mode: ChannelRoutingMode) -> None:
        self.channel.routing_mode = mode
        self.channel.save(update_fields=["routing_mode", "updated_at"])

    def _create_agent(self) -> None:
        AIAgent.objects.create(
            channel=self.channel,
            name="Активный агент",
            model="test/model",
            status=AIAgentStatus.ACTIVE,
        )
