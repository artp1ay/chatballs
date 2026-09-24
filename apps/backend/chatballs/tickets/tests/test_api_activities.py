"""Тесты заметок, комментариев, аудита и гостевого публичного доступа к заявкам."""

import json

from django.test import TestCase
from rest_framework.test import APIClient

from chatballs.conversations.models import Contact
from chatballs.identity.bootstrap import bootstrap_owner
from chatballs.identity.models import Organization, OrganizationMembership
from chatballs.testing import TenantAPIClient
from chatballs.tickets.services import create_ticket


class ActivityAndPublicApiTests(TestCase):
    def setUp(self) -> None:
        bootstrap_owner(email="act-owner@example.com", password="temporary-password")
        self.org = Organization.objects.get(slug="demo")
        self.member = OrganizationMembership.objects.filter(organization=self.org).first()
        self.contact = Contact.objects.create(
            organization=self.org,
            name="Анна Клиент",
        )
        self.ticket = create_ticket(
            organization=self.org,
            subject="Вопрос по тарифам",
            actor_membership=self.member,
            requester_contact=self.contact,
        )

        self.client = TenantAPIClient()
        self.client.login(
            username="act-owner@example.com",
            password="temporary-password",
        )
        self.public_client = APIClient()

    def request(self, method: str, path: str, payload: dict | None = None):
        if method.lower() == "get":
            return self.client.get(path)
        return getattr(self.client, method)(
            path,
            data=json.dumps(payload or {}),
            content_type="application/json",
        )

    def test_notes_crud(self) -> None:
        # Добавление пустой заметки -> 400
        resp_err = self.request("post", f"/api/v1/tickets/{self.ticket.id}/notes/", {"text": ""})
        self.assertEqual(resp_err.status_code, 400)

        # Добавление внутренней заметки
        resp_add = self.request(
            "post",
            f"/api/v1/tickets/{self.ticket.id}/notes/",
            {"text": "Клиент просил перезвонить после 14:00"},
        )
        self.assertEqual(resp_add.status_code, 201)
        self.assertEqual(resp_add.json()["text"], "Клиент просил перезвонить после 14:00")

        # Чтение списка заметок
        resp_list = self.request("get", f"/api/v1/tickets/{self.ticket.id}/notes/")
        self.assertEqual(resp_list.status_code, 200)
        self.assertEqual(len(resp_list.json()), 1)

    def test_comments_and_events(self) -> None:
        # Добавление публичного комментария
        resp_comm = self.request(
            "post",
            f"/api/v1/tickets/{self.ticket.id}/comments/",
            {"text": "Мы отправили вам коммерческое предложение", "is_public": True},
        )
        self.assertEqual(resp_comm.status_code, 201)

        # Список комментариев
        resp_list = self.request("get", f"/api/v1/tickets/{self.ticket.id}/comments/")
        self.assertEqual(resp_list.status_code, 200)
        self.assertEqual(len(resp_list.json()), 1)

        # Просмотр истории аудита
        resp_events = self.request("get", f"/api/v1/tickets/{self.ticket.id}/events/")
        self.assertEqual(resp_events.status_code, 200)
        self.assertGreaterEqual(len(resp_events.json()), 1)

    def test_public_guest_access(self) -> None:
        # Выпуск гостевого токена
        resp_token = self.request("post", f"/api/v1/tickets/{self.ticket.id}/public-access/")
        self.assertEqual(resp_token.status_code, 200)
        token = resp_token.json()["token"]
        self.assertTrue(bool(token))

        # Добавляем внутреннюю заметку (она не должна утечь в публичный API)
        self.request(
            "post",
            f"/api/v1/tickets/{self.ticket.id}/notes/",
            {"text": "Секретная внутренняя пометка"},
        )

        # Добавляем открытый комментарий оператора
        self.request(
            "post",
            f"/api/v1/tickets/{self.ticket.id}/comments/",
            {"text": "Здравствуйте, Анна! Готовы ответить.", "is_public": True},
        )

        # Просмотр гостем без авторизации
        resp_guest = self.public_client.get(f"/api/v1/help/tickets/{token}/")
        self.assertEqual(resp_guest.status_code, 200)
        guest_data = resp_guest.json()
        self.assertEqual(guest_data["ticket"]["subject"], "Вопрос по тарифам")
        self.assertEqual(guest_data["ticket"]["number"], "TKT-000001")
        self.assertEqual(len(guest_data["comments"]), 1)
        self.assertEqual(
            guest_data["comments"][0]["text"],
            "Здравствуйте, Анна! Готовы ответить.",
        )

        # Гость отправляет ответный комментарий
        resp_reply = self.public_client.post(
            f"/api/v1/help/tickets/{token}/comments/",
            data=json.dumps({"text": "Спасибо, уточните стоимость тарифа Pro"}),
            content_type="application/json",
        )
        self.assertEqual(resp_reply.status_code, 201)

        # Проверка неверного токена -> 404
        resp_bad = self.public_client.get("/api/v1/help/tickets/invalid-token-123/")
        self.assertEqual(resp_bad.status_code, 404)
