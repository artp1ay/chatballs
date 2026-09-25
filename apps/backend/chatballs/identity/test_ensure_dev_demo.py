"""Тесты команды ensure_dev_demo (HOM-58)."""

from __future__ import annotations

import tempfile
from io import StringIO

from django.core.management import call_command
from django.test import TestCase, override_settings

from chatballs.identity.demo_models import DemoDataset, DemoDatasetStatus
from chatballs.identity.models import (
    EmployeeRole,
    HumanUser,
    Organization,
    OrganizationMembership,
)

_MEDIA_ROOT = tempfile.mkdtemp(prefix="hub-dev-demo-media-")


@override_settings(MEDIA_ROOT=_MEDIA_ROOT)
class EnsureDevDemoCommandTests(TestCase):
    def test_ensure_dev_demo_installs_organization_and_data(self) -> None:
        out = StringIO()
        call_command("ensure_dev_demo", stdout=out)
        output = out.getvalue()
        self.assertIn("успешно установлен", output)

        # Проверка создания организации «Ателье Норд»
        org = Organization.objects.filter(slug="atelie-nord").first()
        self.assertIsNotNone(org)
        self.assertEqual(org.name, "Ателье Норд")

        # Проверка создания администратора установки
        admin = HumanUser.objects.filter(email="admin@atelie-nord.ru").first()
        self.assertIsNotNone(admin)
        self.assertTrue(admin.check_password("Chatballs-Demo-2026"))
        self.assertTrue(admin.is_instance_admin)

        # Проверка членства владельца
        membership = OrganizationMembership.objects.filter(organization=org, user=admin).first()
        self.assertIsNotNone(membership)
        self.assertEqual(membership.role, EmployeeRole.OWNER)

        # Проверка демо-набора
        dataset = DemoDataset.objects.filter(organization=org).first()
        self.assertIsNotNone(dataset)
        self.assertEqual(dataset.status, DemoDatasetStatus.INSTALLED)
        self.assertGreater(dataset.records_count, 100)

        # Проверка демо-пользователей
        elena = HumanUser.objects.filter(email="e.kuznetsova@atelie-nord.ru").first()
        self.assertIsNotNone(elena)
        self.assertTrue(elena.check_password("Chatballs-Demo-2026"))

        # Проверка повторного запуска (идемпотентность)
        records_before = dataset.records_count
        out_repeat = StringIO()
        call_command("ensure_dev_demo", stdout=out_repeat)
        repeat_output = out_repeat.getvalue()

        self.assertIn("уже существует", repeat_output)
        self.assertIn("уже установлен", repeat_output)

        dataset.refresh_from_db()
        self.assertEqual(dataset.records_count, records_before)
