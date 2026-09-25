"""Автоматический посев dev-окружения с демоданными «Ателье Норд» (HOM-58).

Идемпотентная инициализация организации и демо-набора при старте dev-контура:
1. Создает организацию «Ателье Норд» (slug `atelie-nord`) и владельца-администратора
   (если организация еще не создана).
2. Устанавливает демонстрационный набор «Ателье Норд» через ``identity.demo_seed.service``
   (если демо-набор еще не установлен).
3. При повторном вызове не выполняет лишних действий и не меняет счетчики данных.
"""

from __future__ import annotations

import os

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import translation

from chatballs.ai.knowledge_categories import ensure_uncategorized_category
from chatballs.i18n import t
from chatballs.identity.audit import record_audit_event
from chatballs.identity.demo_models import DemoDataset, DemoDatasetStatus
from chatballs.identity.demo_seed import service
from chatballs.identity.instance_settings import (
    remember_default_language,
    remember_public_host,
)
from chatballs.identity.models import (
    EmployeeRole,
    HumanUser,
    Organization,
    OrganizationMembership,
    OrganizationStatus,
)
from chatballs.tenancy.context import TenantActorKind, TenantContext
from chatballs.tenancy.database import tenant_atomic
from chatballs.tenancy.lookup import organization_by_slug, reserve_organization_id

DEFAULT_ORG_NAME = "Ателье Норд"
DEFAULT_ORG_SLUG = "atelie-nord"
DEFAULT_ADMIN_EMAIL = "admin@atelie-nord.ru"
DEFAULT_ADMIN_PASSWORD = "Chatballs-Demo-2026"
DEFAULT_ADMIN_NAME = "Администратор установки"


class Command(BaseCommand):
    help = "Идемпотентная инициализация dev-окружения: организация «Ателье Норд» и демоданные."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--org-name",
            default=os.environ.get("CHATBALLS_DEV_ORG_NAME", DEFAULT_ORG_NAME),
            help="Название организации (по умолчанию «Ателье Норд»)",
        )
        parser.add_argument(
            "--org-slug",
            default=os.environ.get("CHATBALLS_DEV_ORG_SLUG", DEFAULT_ORG_SLUG),
            help="Slug организации (по умолчанию atelie-nord)",
        )
        parser.add_argument(
            "--admin-email",
            default=os.environ.get("CHATBALLS_DEV_ADMIN_EMAIL", DEFAULT_ADMIN_EMAIL),
            help="Email администратора установки (по умолчанию admin@atelie-nord.ru)",
        )
        parser.add_argument(
            "--admin-password",
            default=os.environ.get("CHATBALLS_DEV_ADMIN_PASSWORD", DEFAULT_ADMIN_PASSWORD),
            help="Пароль администратора (по умолчанию Chatballs-Demo-2026)",
        )

    def handle(self, *args: object, **options: object) -> None:
        org_name = str(options["org_name"]).strip()
        org_slug = str(options["org_slug"]).strip()
        admin_email = HumanUser.objects.normalize_email(str(options["admin_email"])).lower()
        admin_password = str(options["admin_password"])

        with translation.override("ru"):
            organization, owner = self._ensure_organization(
                org_name=org_name,
                org_slug=org_slug,
                admin_email=admin_email,
                admin_password=admin_password,
            )
            self._ensure_demo_dataset(organization=organization, actor=owner)
            self._print_summary(organization=organization, admin_email=admin_email)

    def _ensure_organization(
        self,
        *,
        org_name: str,
        org_slug: str,
        admin_email: str,
        admin_password: str,
    ) -> tuple[Organization, HumanUser]:
        organization = organization_by_slug(org_slug)
        owner = HumanUser.objects.filter(email=admin_email).first()

        if organization is not None:
            if owner is None:
                with tenant_atomic(organization.id):
                    membership = (
                        OrganizationMembership.objects.filter(
                            organization=organization,
                            role=EmployeeRole.OWNER,
                        )
                        .select_related("user")
                        .first()
                    )
                    if membership:
                        owner = membership.user
                    else:
                        owner = HumanUser.objects.filter(is_instance_admin=True).first()
            self.stdout.write(f"Организация «{organization.name}» ({org_slug}) уже существует.")
            return organization, owner

        remember_default_language("ru")
        remember_public_host("localhost", "http")

        with transaction.atomic():
            org_id = reserve_organization_id()
            with tenant_atomic(org_id):
                organization = Organization(
                    id=org_id,
                    name=org_name,
                    slug=org_slug,
                    status=OrganizationStatus.ACTIVE,
                )
                organization.save(force_insert=True)
                ensure_uncategorized_category(organization)

                if owner is None:
                    owner = HumanUser.objects.create_user(
                        email=admin_email,
                        password=admin_password,
                        full_name=DEFAULT_ADMIN_NAME,
                        is_staff=True,
                        is_superuser=True,
                        is_instance_admin=True,
                    )

                OrganizationMembership.objects.get_or_create(
                    user=owner,
                    organization=organization,
                    defaults={
                        "role": EmployeeRole.OWNER,
                        "position_title": t("setup.owner_position"),
                        "totp_required": False,
                    },
                )

                record_audit_event(
                    organization=organization,
                    actor=owner,
                    action="identity.instance_setup_completed",
                    object_type="Organization",
                    object_id=str(organization.public_id),
                    payload={"organizationName": organization.name, "installDemo": True},
                )

        self.stdout.write(
            self.style.SUCCESS(f"Создана организация «{org_name}» и администратор {admin_email}.")
        )
        return organization, owner

    def _ensure_demo_dataset(
        self,
        *,
        organization: Organization,
        actor: HumanUser | None,
    ) -> None:
        context = TenantContext.for_resource(
            organization,
            actor_kind=TenantActorKind.SYSTEM,
            actor_user=actor,
        )

        with tenant_atomic(context):
            dataset = (
                DemoDataset.objects.select_for_update().filter(organization=organization).first()
            )
            if dataset is not None and dataset.status == DemoDatasetStatus.INSTALLED:
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Демо-набор «{organization.name}» уже установлен ({dataset.records_count} записей)."
                    )
                )
                return

            if dataset is None:
                dataset = DemoDataset.objects.create(
                    organization=organization,
                    status=DemoDatasetStatus.INSTALLING,
                    requested_by=actor,
                )
            else:
                dataset.status = DemoDatasetStatus.INSTALLING
                dataset.save(update_fields=["status"])

            dataset = service.install(context=context, dataset=dataset)
            if dataset.status != DemoDatasetStatus.INSTALLED:
                raise CommandError(f"Ошибка установки демо-набора: {dataset.error}")

            self.stdout.write(
                self.style.SUCCESS(
                    f"Демо-набор «{organization.name}» успешно установлен ({dataset.records_count} записей)."
                )
            )

    def _print_summary(self, *, organization: Organization, admin_email: str) -> None:
        self.stdout.write("")
        self.stdout.write("======================================================================")
        self.stdout.write("Chatballs Dev-контур готов к работе!")
        self.stdout.write("")
        self.stdout.write("Интерфейс:     http://localhost/")
        self.stdout.write("Платформа:     http://platform.localhost/")
        self.stdout.write("Веб-чат:       http://localhost/chat/")
        self.stdout.write("")
        self.stdout.write("Учетные записи (единый пароль: Chatballs-Demo-2026):")
        self.stdout.write(f"  - Администратор установки: {admin_email}")
        self.stdout.write(
            "  - Администратор демо:     e.kuznetsova@atelie-nord.ru (Елена Кузнецова)"
        )
        self.stdout.write("  - Администратор демо:     a.kim@atelie-nord.ru (Анна Ким)")
        self.stdout.write("  - Оператор:               s.petrova@atelie-nord.ru (Светлана Петрова)")
        self.stdout.write("  - Поддержка:              i.saveliev@atelie-nord.ru (Игорь Савельев)")
        self.stdout.write("  - Сотрудник (TOTP):       k.volkov@atelie-nord.ru (Кирилл Волков)")
        self.stdout.write("======================================================================")
        self.stdout.write("")
