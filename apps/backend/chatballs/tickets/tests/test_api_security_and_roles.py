"""Интеграционные тесты безопасности, ролевого доступа (RBAC) и межорганизационной изоляции API."""

import json

from django.test import TestCase

from chatballs.channels.models import Channel
from chatballs.conversations.models import Contact, Conversation
from chatballs.identity.bootstrap import bootstrap_owner
from chatballs.identity.models import (
    EmployeeRole,
    HumanUser,
    Organization,
    OrganizationMembership,
)
from chatballs.testing import TenantAPIClient
from chatballs.tickets.models import TicketPriority, TicketStatus
from chatballs.tickets.services import create_ticket


class TicketSecurityAndRolesApiTests(TestCase):
    def setUp(self) -> None:
        # Организация 1 (текущий арендатор)
        bootstrap_owner(email="owner1@example.com", password="Password-123")
        self.org1 = Organization.objects.get(slug="demo")
        self.user_owner1 = HumanUser.objects.get(email="owner1@example.com")

        # Создаем администратора и сотрудника в организации 1
        self.user_admin1 = HumanUser.objects.create_user(
            email="admin1@example.com", password="Password-123"
        )
        self.membership_admin1 = OrganizationMembership.objects.create(
            user=self.user_admin1,
            organization=self.org1,
            role=EmployeeRole.ADMIN,
            position_title="Administrator",
        )

        self.user_employee1 = HumanUser.objects.create_user(
            email="employee1@example.com", password="Password-123"
        )
        self.membership_employee1 = OrganizationMembership.objects.create(
            user=self.user_employee1,
            organization=self.org1,
            role=EmployeeRole.EMPLOYEE,
            position_title="Support Agent",
        )

        # Контакт и заявка организации 1
        self.contact1 = Contact.objects.create(
            organization=self.org1,
            name="Клиент Орг 1",
        )
        self.ticket1 = create_ticket(
            organization=self.org1,
            subject="Заявка организации 1",
            description="Проблема в орг 1",
            requester_contact=self.contact1,
            priority=TicketPriority.NORMAL,
        )

        # Организация 2 (чужой арендатор)
        self.org2 = Organization.objects.create(name="Чужая Организация", slug="foreign-org")
        self.user_owner2 = HumanUser.objects.create_user(
            email="owner2@example.com", password="Password-123"
        )
        self.membership_owner2 = OrganizationMembership.objects.create(
            user=self.user_owner2,
            organization=self.org2,
            role=EmployeeRole.OWNER,
            position_title="Foreign Owner",
        )
        self.contact2 = Contact.objects.create(
            organization=self.org2,
            name="Клиент Орг 2",
        )
        self.channel2 = Channel.objects.create(
            organization=self.org2,
            code="foreign-chat",
            name="Foreign Chat",
        )
        self.conv2 = Conversation.objects.create(
            organization=self.org2,
            channel=self.channel2,
            contact=self.contact2,
        )
        self.ticket2 = create_ticket(
            organization=self.org2,
            subject="Секретная заявка орг 2",
            description="Конфиденциальные данные орг 2",
            requester_contact=self.contact2,
            priority=TicketPriority.URGENT,
        )

    def _client_for(self, user: HumanUser) -> TenantAPIClient:
        client = TenantAPIClient()
        client.force_login(user)
        return client

    def test_owner_role_access(self) -> None:
        """Владелец организации имеет полный доступ к просмотру и управлению заявками."""
        client = self._client_for(self.user_owner1)
        resp = client.get("/api/v1/tickets/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()["items"]), 1)

        create_resp = client.post(
            "/api/v1/tickets/",
            data=json.dumps({"subject": "Создано владельцем"}),
            content_type="application/json",
        )
        self.assertEqual(create_resp.status_code, 201)

    def test_admin_role_access(self) -> None:
        """Администратор имеет полный доступ к просмотру и управлению заявками."""
        client = self._client_for(self.user_admin1)
        resp = client.get(f"/api/v1/tickets/{self.ticket1.id}/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["subject"], "Заявка организации 1")

        # Переход статуса
        trans_resp = client.post(
            f"/api/v1/tickets/{self.ticket1.id}/transitions/",
            data=json.dumps({
                "target_status": TicketStatus.IN_PROGRESS,
                "expected_version": self.ticket1.version,
            }),
            content_type="application/json",
        )
        self.assertEqual(trans_resp.status_code, 200)
        self.assertEqual(trans_resp.json()["status"], TicketStatus.IN_PROGRESS)

    def test_employee_role_access(self) -> None:
        """Сотрудник службы поддержки может просматривать и обрабатывать заявки."""
        client = self._client_for(self.user_employee1)
        resp = client.get("/api/v1/tickets/")
        self.assertEqual(resp.status_code, 200)

        # Добавление внутренней заметки
        note_resp = client.post(
            f"/api/v1/tickets/{self.ticket1.id}/notes/",
            data=json.dumps({"text": "Заметка от оператора"}),
            content_type="application/json",
        )
        self.assertEqual(note_resp.status_code, 201)

        # Добавление комментария
        comment_resp = client.post(
            f"/api/v1/tickets/{self.ticket1.id}/comments/",
            data=json.dumps({"text": "Ответ клиенту"}),
            content_type="application/json",
        )
        self.assertEqual(comment_resp.status_code, 201)

    def test_unauthenticated_request_rejected(self) -> None:
        """Неавторизованный запрос к тенант-скоупу отклоняется с кодом 404 (защита от сканирования)."""
        client = TenantAPIClient()
        resp = client.get(f"/api/v1/organizations/{self.org1.public_id}/tickets/")
        self.assertEqual(resp.status_code, 404)

    def test_cross_tenant_ticket_list_isolation(self) -> None:
        """В списке заявок пользователь видит только заявки своей организации."""
        client = self._client_for(self.user_owner1)
        resp = client.get("/api/v1/tickets/")
        self.assertEqual(resp.status_code, 200)
        items = resp.json()["items"]
        item_ids = [item["id"] for item in items]
        self.assertIn(self.ticket1.id, item_ids)
        self.assertNotIn(self.ticket2.id, item_ids)

    def test_cross_tenant_direct_read_blocked(self) -> None:
        """Прямой запрос по ID чужой заявки возвращает 404 (изоляция тенантов)."""
        client = self._client_for(self.user_owner1)
        resp = client.get(f"/api/v1/tickets/{self.ticket2.id}/")
        self.assertEqual(resp.status_code, 404)

    def test_cross_tenant_mutation_blocked(self) -> None:
        """Попытка изменения чужой заявки (PATCH) отклоняется с кодом 404."""
        client = self._client_for(self.user_owner1)
        resp = client.patch(
            f"/api/v1/tickets/{self.ticket2.id}/",
            data=json.dumps({"subject": "Попытка подмены"}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 404)

    def test_cross_tenant_transition_blocked(self) -> None:
        """Попытка смены статуса чужой заявки отклоняется с кодом 404."""
        client = self._client_for(self.user_owner1)
        resp = client.post(
            f"/api/v1/tickets/{self.ticket2.id}/transitions/",
            data=json.dumps({
                "target_status": TicketStatus.CANCELLED,
                "reason": "Взлом",
                "expected_version": 1,
            }),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 404)

    def test_cross_tenant_notes_and_comments_blocked(self) -> None:
        """Попытки чтения и добавления заметок/комментариев к чужой заявке возвращают 404."""
        client = self._client_for(self.user_owner1)

        resp_get_notes = client.get(f"/api/v1/tickets/{self.ticket2.id}/notes/")
        self.assertEqual(resp_get_notes.status_code, 404)

        resp_post_note = client.post(
            f"/api/v1/tickets/{self.ticket2.id}/notes/",
            data=json.dumps({"text": "Шпионская заметка"}),
            content_type="application/json",
        )
        self.assertEqual(resp_post_note.status_code, 404)

        resp_get_comments = client.get(f"/api/v1/tickets/{self.ticket2.id}/comments/")
        self.assertEqual(resp_get_comments.status_code, 404)

        resp_post_comment = client.post(
            f"/api/v1/tickets/{self.ticket2.id}/comments/",
            data=json.dumps({"text": "Шпионский комментарий"}),
            content_type="application/json",
        )
        self.assertEqual(resp_post_comment.status_code, 404)

    def test_cross_tenant_conversation_link_rejected_on_creation(self) -> None:
        """Нельзя привязать диалог или контакт чужой организации при создании заявки."""
        client = self._client_for(self.user_owner1)
        resp = client.post(
            "/api/v1/tickets/",
            data=json.dumps({
                "subject": "Атака через чужой контакт",
                "requester_contact_id": self.contact2.id,
            }),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn(resp.json()["error"], ["not_found", "validation_error"])

    def test_chat_deletion_resilience_api(self) -> None:
        """Удаление связанного чата не удаляет заявку: заявка доступна через API со сброшенной связью."""
        channel1 = Channel.objects.create(
            organization=self.org1,
            code="org1-chat",
            name="Org1 Chat",
        )
        conv1 = Conversation.objects.create(
            organization=self.org1,
            channel=channel1,
            contact=self.contact1,
        )
        client = self._client_for(self.user_owner1)
        create_resp = client.post(
            f"/api/v1/conversations/{conv1.id}/ticket/",
            data=json.dumps({"subject": "Заявка из чата на удаление"}),
            content_type="application/json",
        )
        self.assertEqual(create_resp.status_code, 201)
        ticket_id = create_resp.json()["id"]

        # Удаляем диалог
        conv1.delete()

        # Заявка по-прежнему доступна через API
        get_resp = client.get(f"/api/v1/tickets/{ticket_id}/")
        self.assertEqual(get_resp.status_code, 200)
        self.assertEqual(get_resp.json()["subject"], "Заявка из чата на удаление")
        self.assertIsNone(get_resp.json()["origin_conversation_id"])
