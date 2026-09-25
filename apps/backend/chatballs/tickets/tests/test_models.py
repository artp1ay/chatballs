"""Тесты моделей ядра Helpdesk, генерации номеров и каскадного удаления."""

from django.db import IntegrityError
from django.test import TestCase

from chatballs.channels.models import Channel
from chatballs.conversations.models import Contact, Conversation
from chatballs.identity.bootstrap import bootstrap_owner
from chatballs.identity.models import Organization
from chatballs.tickets.models import (
    HeldeskSettings,
    Ticket,
    TicketConversationLink,
    TicketPriority,
    TicketStatus,
)
from chatballs.tickets.services.ticket_creation import generate_ticket_number


class TicketModelsTests(TestCase):
    def setUp(self) -> None:
        bootstrap_owner(email="owner-models@example.com", password="temporary-password")
        self.org = Organization.objects.get(slug="demo")
        self.channel = Channel.objects.create(
            organization=self.org,
            code="test-channel",
            name="Тестовый канал",
        )
        self.contact = Contact.objects.create(
            organization=self.org,
            name="Иван Тестовый",
        )
        self.conversation = Conversation.objects.create(
            organization=self.org,
            channel=self.channel,
            contact=self.contact,
        )

    def test_settings_default_values(self) -> None:
        settings = HeldeskSettings.objects.create(organization=self.org)
        self.assertTrue(settings.is_enabled)
        self.assertEqual(settings.ticket_number_prefix, "TKT")
        self.assertEqual(settings.default_category, "general")
        self.assertEqual(settings.auto_close_resolved_days, 7)

    def test_ticket_number_generation(self) -> None:
        num1 = generate_ticket_number(self.org)
        num2 = generate_ticket_number(self.org)
        self.assertEqual(num1, "TKT-000001")
        self.assertEqual(num2, "TKT-000002")

    def test_ticket_creation_and_defaults(self) -> None:
        ticket = Ticket.objects.create(
            organization=self.org,
            number=generate_ticket_number(self.org),
            subject="Проблема со входом",
            description="Не приходит СМС с кодом",
            requester_contact=self.contact,
            origin_conversation=self.conversation,
        )
        self.assertEqual(ticket.status, TicketStatus.NEW)
        self.assertEqual(ticket.priority, TicketPriority.NORMAL)
        self.assertEqual(ticket.version, 1)
        self.assertEqual(ticket.origin_conversation, self.conversation)

    def test_conversation_deletion_sets_null_on_ticket(self) -> None:
        ticket = Ticket.objects.create(
            organization=self.org,
            number=generate_ticket_number(self.org),
            subject="Вопрос по счету",
            origin_conversation=self.conversation,
        )
        link = TicketConversationLink.objects.create(
            organization=self.org,
            ticket=ticket,
            conversation=self.conversation,
        )

        self.conversation.delete()

        ticket.refresh_from_db()
        link.refresh_from_db()

        self.assertIsNone(ticket.origin_conversation)
        self.assertIsNone(link.conversation)

    def test_ticket_unique_number_in_organization(self) -> None:
        Ticket.objects.create(
            organization=self.org,
            number="TKT-100",
            subject="Первый тикет",
        )
        with self.assertRaises(IntegrityError):
            Ticket.objects.create(
                organization=self.org,
                number="TKT-100",
                subject="Дублирующий номер",
            )
