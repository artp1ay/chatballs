"""Интеграционные тесты создания заявок напрямую из оперативного диалога чата."""

import json

from django.test import TestCase

from chatballs.channels.models import Channel
from chatballs.conversations.models import Contact, Conversation
from chatballs.identity.bootstrap import bootstrap_owner
from chatballs.identity.models import Organization
from chatballs.testing import TenantAPIClient
from chatballs.tickets.models import (
    TicketContactLink,
    TicketConversationLink,
    TicketPriority,
    TicketStatus,
)


class ConversationTicketTests(TestCase):
    def setUp(self) -> None:
        bootstrap_owner(email="conv-owner@example.com", password="temporary-password")
        self.org = Organization.objects.get(slug="demo")
        self.channel = Channel.objects.create(
            organization=self.org,
            code="support-chat",
            name="Поддержка в чате",
        )
        self.contact = Contact.objects.create(
            organization=self.org,
            name="Мария Заказчикова",
        )
        self.conversation = Conversation.objects.create(
            organization=self.org,
            channel=self.channel,
            contact=self.contact,
        )
        self.client = TenantAPIClient()
        self.client.login(
            username="conv-owner@example.com",
            password="temporary-password",
        )

    def test_create_ticket_from_conversation(self) -> None:
        url = f"/api/v1/conversations/{self.conversation.id}/ticket/"
        payload = {
            "subject": "Сбой оплаты в корзине",
            "description": "Клиент сообщил о зависании при нажатии «Оплатить»",
            "priority": TicketPriority.URGENT,
            "category": "billing",
        }

        resp = self.client.post(
            url,
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 201)
        data = resp.json()

        self.assertEqual(data["subject"], "Сбой оплаты в корзине")
        self.assertEqual(data["status"], TicketStatus.NEW)
        self.assertEqual(data["priority"], TicketPriority.URGENT)
        self.assertEqual(data["category"], "billing")
        self.assertEqual(data["origin_conversation_id"], self.conversation.id)
        self.assertEqual(data["requester_contact_id"], self.contact.id)

        # Проверяем созданные ссылки в БД
        ticket_id = data["id"]
        conv_link = TicketConversationLink.objects.filter(
            ticket_id=ticket_id,
            conversation=self.conversation,
        ).first()
        self.assertIsNotNone(conv_link)

        contact_link = TicketContactLink.objects.filter(
            ticket_id=ticket_id,
            contact=self.contact,
        ).first()
        self.assertIsNotNone(contact_link)
        self.assertEqual(contact_link.role, "requester")
