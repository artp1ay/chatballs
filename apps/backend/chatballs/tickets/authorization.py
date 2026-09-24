"""Авторизация операций над заявками службы поддержки."""

from __future__ import annotations

from django.core.exceptions import PermissionDenied

from chatballs.i18n import t
from chatballs.identity.policy import has_capability_any_scope
from chatballs.tenancy.context import TenantContext

TICKETS_VIEW = "tickets.view"
TICKETS_MANAGE = "tickets.manage"


def _membership(context: TenantContext):
    membership = context.membership
    if membership is None or membership.organization_id != context.organization_id:
        return None
    return membership


def has_ticket_capability(context: TenantContext, capability: str) -> bool:
    membership = _membership(context)
    if membership is None:
        return False
    return has_capability_any_scope(membership, capability)


def require_ticket_capability(context: TenantContext, capability: str) -> None:
    if not has_ticket_capability(context, capability):
        raise PermissionDenied(t("tickets.permission_denied"))
