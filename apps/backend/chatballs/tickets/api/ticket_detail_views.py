"""Представления просмотра, обновления и смены статуса заявки."""

from __future__ import annotations

from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from chatballs.api.permissions import HasCapability
from chatballs.i18n import t
from chatballs.identity.group_models import EmployeeGroup
from chatballs.identity.models import OrganizationMembership
from chatballs.tickets.authorization import TICKETS_MANAGE, TICKETS_VIEW
from chatballs.tickets.models.ticket import Ticket
from chatballs.tickets.payloads import ticket_payload
from chatballs.tickets.selectors import ticket_for_organization
from chatballs.tickets.services import update_ticket
from chatballs.tickets.state_machine import (
    TransitionError,
    VersionConflictError,
    execute_transition,
)


class TicketDetailView(APIView):
    """Детальный просмотр и частичное редактирование заявки."""

    permission_classes = [HasCapability]
    required_capabilities = {
        "GET": TICKETS_VIEW,
        "PATCH": TICKETS_MANAGE,
    }

    def _get_ticket(self, request: Request, ticket_id: int) -> Ticket:
        org = request.tenant_context.organization
        try:
            return ticket_for_organization(org, ticket_id)
        except Ticket.DoesNotExist:
            return None

    def get(self, request: Request, ticket_id: int, **kwargs) -> Response:
        ticket = self._get_ticket(request, ticket_id)
        if ticket is None:
            return Response(
                {"error": "not_found", "detail": t("tickets.not_found")},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(ticket_payload(ticket))

    def patch(self, request: Request, ticket_id: int, **kwargs) -> Response:
        ticket = self._get_ticket(request, ticket_id)
        if ticket is None:
            return Response(
                {"error": "not_found", "detail": t("tickets.not_found")},
                status=status.HTTP_404_NOT_FOUND,
            )

        data = request.data or {}
        raw_version = data.get("expected_version")
        if raw_version is None:
            raw_version = data.get("expectedVersion")
        if raw_version is None:
            raw_version = data.get("version")

        expected_version = None
        if raw_version is not None:
            try:
                expected_version = int(raw_version)
            except (TypeError, ValueError):
                pass

        updates = {}
        if "subject" in data:
            updates["subject"] = str(data["subject"]).strip()
        if "description" in data:
            updates["description"] = str(data["description"]).strip()
        if "priority" in data:
            updates["priority"] = data["priority"]
        if "category" in data:
            updates["category"] = data["category"]

        org = request.tenant_context.organization
        if "assignee_membership_id" in data:
            assignee_id = data["assignee_membership_id"]
            if assignee_id is None:
                updates["assignee_membership"] = None
            else:
                membership = OrganizationMembership.objects.filter(
                    id=assignee_id, organization=org
                ).first()
                if membership is None:
                    return Response(
                        {"error": "not_found", "detail": t("tickets.assignee_not_found")},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                updates["assignee_membership"] = membership

        if "group_id" in data:
            group_id = data["group_id"]
            if group_id is None:
                updates["group"] = None
            else:
                group = EmployeeGroup.objects.filter(id=group_id, organization=org).first()
                if group is None:
                    return Response(
                        {"error": "not_found", "detail": t("tickets.group_not_found")},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                updates["group"] = group

        try:
            updated = update_ticket(
                ticket,
                expected_version=expected_version,
                actor_membership=request.tenant_context.membership,
                **updates,
            )
        except VersionConflictError as err:
            return Response(
                {
                    "error": "version_conflict",
                    "detail": str(err),
                    "current_version": err.current_version,
                },
                status=status.HTTP_409_CONFLICT,
            )

        return Response(ticket_payload(updated))


class TicketTransitionView(APIView):
    """Атомарная смена статуса заявки с проверкой версий."""

    permission_classes = [HasCapability]
    required_capability = TICKETS_MANAGE

    def post(self, request: Request, ticket_id: int, **kwargs) -> Response:
        org = request.tenant_context.organization
        try:
            ticket = ticket_for_organization(org, ticket_id)
        except Ticket.DoesNotExist:
            return Response(
                {"error": "not_found", "detail": t("tickets.not_found")},
                status=status.HTTP_404_NOT_FOUND,
            )

        data = request.data or {}
        target_status = data.get("target_status")
        if not target_status:
            return Response(
                {"error": "bad_request", "detail": t("tickets.status_required")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_version = data.get("expected_version")
        if raw_version is None:
            raw_version = data.get("expectedVersion")

        expected_version = None
        if raw_version is not None:
            try:
                expected_version = int(raw_version)
            except (TypeError, ValueError):
                pass

        reason = data.get("reason")
        comment = data.get("comment")

        try:
            updated = execute_transition(
                ticket,
                target_status=target_status,
                actor_membership=request.tenant_context.membership,
                reason=reason,
                comment=comment,
                expected_version=expected_version,
            )
        except VersionConflictError as err:
            return Response(
                {
                    "error": "version_conflict",
                    "detail": str(err),
                    "current_version": err.current_version,
                },
                status=status.HTTP_409_CONFLICT,
            )
        except TransitionError as err:
            return Response(
                {
                    "error": "invalid_transition",
                    "detail": str(err),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(ticket_payload(updated))
