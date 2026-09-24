"""Тесты изоляции тенантов и cross-tenant DB guards для Helpdesk."""

from django.core.exceptions import ValidationError
from django.db import DatabaseError, connection, transaction
from django.test import TestCase

from chatballs.channels.models import Channel
from chatballs.conversations.models import Contact, Conversation
from chatballs.identity.bootstrap import bootstrap_owner
from chatballs.identity.group_models import EmployeeGroup
from chatballs.identity.models import Organization, OrganizationMembership
from chatballs.tickets.models import (
    Ticket,
    TicketComment,
    TicketConversationLink,
    TicketNote,
)
from chatballs.tickets.services import create_ticket


class CrossTenantGuardsTests(TestCase):
    def setUp(self) -> None:
        bootstrap_owner(email="ct-owner1@example.com", password="temporary-password")
        self.org1 = Organization.objects.get(slug="demo")
        self.member1 = OrganizationMembership.objects.filter(organization=self.org1).first()

        self.org2 = Organization.objects.create(name="Second Org", slug="org-2")
        self.channel2 = Channel.objects.create(
            organization=self.org2,
            code="ch-2",
            name="Канал 2",
        )
        self.contact2 = Contact.objects.create(
            organization=self.org2,
            name="Клиент Орг 2",
        )
        self.conv2 = Conversation.objects.create(
            organization=self.org2,
            channel=self.channel2,
            contact=self.contact2,
        )
        self.group2 = EmployeeGroup.objects.create(
            organization=self.org2,
            name="Группа 2",
        )

        self.ticket1 = create_ticket(
            organization=self.org1,
            subject="Тикет организации 1",
            actor_membership=self.member1,
        )

    def test_clean_rejects_foreign_requester(self) -> None:
        ticket = Ticket(
            organization=self.org1,
            number="TKT-CROSS-1",
            subject="Тест",
            requester_contact=self.contact2,
        )
        with self.assertRaises(ValidationError):
            ticket.clean()

    def test_clean_rejects_foreign_group(self) -> None:
        ticket = Ticket(
            organization=self.org1,
            number="TKT-CROSS-2",
            subject="Тест",
            group=self.group2,
        )
        with self.assertRaises(ValidationError):
            ticket.clean()

    def test_orm_validation_rejects_foreign_contact(self) -> None:
        with self.assertRaises(ValidationError):
            Ticket.objects.create(
                organization=self.org1,
                number="TKT-DB-1",
                subject="Тест БД",
                requester_contact=self.contact2,
            )

    def test_orm_validation_rejects_foreign_group(self) -> None:
        with self.assertRaises(ValidationError):
            Ticket.objects.create(
                organization=self.org1,
                number="TKT-DB-2",
                subject="Тест БД",
                group=self.group2,
            )

    def test_orm_validation_rejects_foreign_conversation_link(self) -> None:
        with self.assertRaises(ValidationError):
            TicketConversationLink.objects.create(
                organization=self.org1,
                ticket=self.ticket1,
                conversation=self.conv2,
            )

    def test_orm_validation_rejects_foreign_note_author(self) -> None:
        member2 = OrganizationMembership.objects.create(
            organization=self.org2,
            user=self.member1.user,
            role="employee",
        )
        with self.assertRaises(ValidationError):
            TicketNote.objects.create(
                organization=self.org1,
                ticket=self.ticket1,
                author_membership=member2,
                text="Заметка от чужого сотрудника",
            )

    def test_orm_validation_rejects_foreign_comment_contact(self) -> None:
        with self.assertRaises(ValidationError):
            TicketComment.objects.create(
                organization=self.org1,
                ticket=self.ticket1,
                author_contact=self.contact2,
                text="Комментарий от чужого контакта",
            )

    def test_db_guard_trigger_rejects_foreign_contact_on_raw_insert(self) -> None:
        with self.assertRaises(DatabaseError):
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO tickets_ticket (
                        organization_id, number, subject, description,
                        status, priority, category, requester_contact_id,
                        version, resolution_reason, cancellation_reason,
                        created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                    """,
                    [
                        self.org1.id,
                        "TKT-DB-RAW-1",
                        "Тест триггера БД",
                        "",
                        "new",
                        "normal",
                        "general",
                        self.contact2.id,
                        1,
                        "",
                        "",
                    ],
                )
