"""Интеграционные тесты REST API заявок (список, детали, мутация, переходы)."""

import json

from django.test import TestCase

from chatballs.conversations.models import Contact
from chatballs.identity.bootstrap import bootstrap_owner
from chatballs.identity.models import Organization
from chatballs.testing import TenantAPIClient
from chatballs.tickets.models import TicketPriority, TicketStatus
from chatballs.tickets.services import create_ticket


class TicketApiTests(TestCase):
    def setUp(self) -> None:
        bootstrap_owner(email="ticket-api-owner@example.com", password="temporary-password")
        self.org = Organization.objects.get(slug="demo")
        self.contact = Contact.objects.create(
            organization=self.org,
            name="Петр Клиентов",
        )
        self.client = TenantAPIClient()
        self.client.login(
            username="ticket-api-owner@example.com",
            password="temporary-password",
        )

    def request(self, method: str, path: str, payload: dict | None = None):
        if method.lower() == "get":
            return self.client.get(path)
        return getattr(self.client, method)(
            path,
            data=json.dumps(payload or {}),
            content_type="application/json",
        )

    def test_list_tickets_and_create(self) -> None:
        # Список пуст
        resp = self.request("get", "/api/v1/tickets/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()["items"]), 0)

        # Создание без темы -> 400
        resp_err = self.request("post", "/api/v1/tickets/", {"subject": ""})
        self.assertEqual(resp_err.status_code, 400)
        self.assertEqual(resp_err.json()["error"], "validation_error")

        # Успешное создание
        resp_create = self.request(
            "post",
            "/api/v1/tickets/",
            {
                "subject": "Не работает почта",
                "description": "Письма не доставляются",
                "priority": TicketPriority.HIGH,
                "requester_contact_id": self.contact.id,
            },
        )
        self.assertEqual(resp_create.status_code, 201)
        data = resp_create.json()
        self.assertEqual(data["subject"], "Не работает почта")
        self.assertEqual(data["status"], TicketStatus.NEW)
        self.assertEqual(data["number"], "TKT-000001")
        self.assertEqual(data["version"], 1)

        # Теперь в списке 1 заявка
        resp_list = self.request("get", "/api/v1/tickets/")
        self.assertEqual(resp_list.status_code, 200)
        self.assertEqual(len(resp_list.json()["items"]), 1)
        self.assertEqual(resp_list.json()["total"], 1)

    def test_ticket_detail_and_patch(self) -> None:
        ticket = create_ticket(
            organization=self.org,
            subject="Вопрос по API",
            description="Где документация?",
        )

        resp = self.request("get", f"/api/v1/tickets/{ticket.id}/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["id"], ticket.id)

        # Частичный патч
        resp_patch = self.request(
            "patch",
            f"/api/v1/tickets/{ticket.id}/",
            {
                "description": "Нашел документацию, нужен ключ",
                "priority": TicketPriority.LOW,
                "expected_version": 1,
            },
        )
        self.assertEqual(resp_patch.status_code, 200)
        self.assertEqual(resp_patch.json()["priority"], TicketPriority.LOW)
        self.assertEqual(resp_patch.json()["version"], 2)

        # Патч с устаревшей версией -> 409
        resp_conflict = self.request(
            "patch",
            f"/api/v1/tickets/{ticket.id}/",
            {
                "description": "Попытка перезаписи старой версии",
                "expected_version": 1,
            },
        )
        self.assertEqual(resp_conflict.status_code, 409)
        self.assertEqual(resp_conflict.json()["error"], "version_conflict")
        self.assertEqual(resp_conflict.json()["current_version"], 2)

    def test_ticket_transitions_api(self) -> None:
        ticket = create_ticket(organization=self.org, subject="Переход статусов")

        # Переход NEW -> IN_PROGRESS
        resp_trans = self.request(
            "post",
            f"/api/v1/tickets/{ticket.id}/transitions/",
            {
                "target_status": TicketStatus.IN_PROGRESS,
                "expected_version": 1,
            },
        )
        self.assertEqual(resp_trans.status_code, 200)
        self.assertEqual(resp_trans.json()["status"], TicketStatus.IN_PROGRESS)
        self.assertEqual(resp_trans.json()["version"], 2)

        # Попытка некорректного перехода IN_PROGRESS -> DUPLICATE без причины
        resp_invalid = self.request(
            "post",
            f"/api/v1/tickets/{ticket.id}/transitions/",
            {
                "target_status": TicketStatus.DUPLICATE,
                "expected_version": 2,
            },
        )
        self.assertEqual(resp_invalid.status_code, 400)
        self.assertEqual(resp_invalid.json()["error"], "invalid_transition")

        # Переход с несовпадающей версией -> 409 Conflict
        resp_conflict = self.request(
            "post",
            f"/api/v1/tickets/{ticket.id}/transitions/",
            {
                "target_status": TicketStatus.RESOLVED,
                "reason": "Вопрос решен",
                "expected_version": 999,
            },
        )
        self.assertEqual(resp_conflict.status_code, 409)
        self.assertEqual(resp_conflict.json()["error"], "version_conflict")

        # Успешное решение
        resp_resolved = self.request(
            "post",
            f"/api/v1/tickets/{ticket.id}/transitions/",
            {
                "target_status": TicketStatus.RESOLVED,
                "reason": "Вопрос решен корректно",
                "expected_version": 2,
            },
        )
        self.assertEqual(resp_resolved.status_code, 200)
        self.assertEqual(resp_resolved.json()["status"], TicketStatus.RESOLVED)
        self.assertIsNotNone(resp_resolved.json()["resolved_at"])
