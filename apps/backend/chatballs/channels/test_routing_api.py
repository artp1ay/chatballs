"""Интеграционные тесты API настроек маршрутизации канала."""

import json

from django.test import TestCase

from chatballs.channels.models import Channel, ChannelRoutingMode
from chatballs.identity.bootstrap import bootstrap_owner
from chatballs.identity.models import Organization
from chatballs.testing import TenantAPIClient


class RoutingApiTests(TestCase):
    def setUp(self) -> None:
        bootstrap_owner(email="routing-api-owner@example.com", password="temporary-password")
        self.organization = Organization.objects.get(slug="demo")
        self.channel = Channel.objects.create(
            organization=self.organization,
            code="routing-api",
            name="Маршрутизация API",
        )
        self.client = TenantAPIClient()
        self.client.login(
            username="routing-api-owner@example.com",
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

    def test_mode_and_business_hours_round_trip(self) -> None:
        response = self.request(
            "patch",
            f"/api/v1/channels/{self.channel.id}/",
            {"routingMode": ChannelRoutingMode.RULE_BASED},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["routing_mode"], ChannelRoutingMode.RULE_BASED)

        response = self.request(
            "put",
            f"/api/v1/channels/{self.channel.id}/business-hours/",
            {
                "timezone": "Europe/Moscow",
                "weeklySchedule": {"mon": [{"start": "09:00", "end": "18:00"}]},
                "holidays": ["2026-05-01"],
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["timezone"], "Europe/Moscow")
        self.assertEqual(
            self.request("get", f"/api/v1/channels/{self.channel.id}/business-hours/").json(),
            response.json(),
        )

    def test_rule_lifecycle_and_camel_case_payload(self) -> None:
        group = self.organization.employee_groups.get(name="Операторы")
        response = self.request(
            "post",
            f"/api/v1/channels/{self.channel.id}/routing-rules/",
            {
                "name": "Жалобы оператору",
                "isActive": True,
                "triggerEvent": "CONVERSATION_CREATED",
                "conditions": {
                    "field": "contact.labels",
                    "op": "contains",
                    "value": "VIP",
                },
                "actionTarget": "ASSIGN_GROUP",
                "targetGroupId": group.id,
            },
        )
        self.assertEqual(response.status_code, 201)
        rule = response.json()
        self.assertEqual(rule["target_group_id"], group.id)

        listed = self.request(
            "get", f"/api/v1/channels/{self.channel.id}/routing-rules/"
        )
        self.assertEqual([item["id"] for item in listed.json()["items"]], [rule["id"]])

        reordered = self.request(
            "post",
            f"/api/v1/channels/{self.channel.id}/routing-rules/reorder/",
            {"ruleIds": [rule["id"]]},
        )
        self.assertEqual(reordered.status_code, 200)

        deleted = self.request(
            "delete", f"/api/v1/channels/{self.channel.id}/routing-rules/{rule['id']}/"
        )
        self.assertEqual(deleted.status_code, 204)

    def test_foreign_channel_is_hidden(self) -> None:
        other = Organization.objects.create(slug="routing-api-other", name="Другая")
        foreign = Channel.objects.create(
            organization=other,
            code="foreign",
            name="Чужой канал",
        )
        response = self.request("get", f"/api/v1/channels/{foreign.id}/")
        self.assertEqual(response.status_code, 404)
