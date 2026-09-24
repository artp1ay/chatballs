"""Представления списка и создания заявок службы поддержки."""

from __future__ import annotations

from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from chatballs.api.pagination import cursor_id, window, window_payload, window_size
from chatballs.api.permissions import HasCapability
from chatballs.conversations.models import Contact
from chatballs.i18n import t
from chatballs.identity.group_models import EmployeeGroup
from chatballs.identity.models import OrganizationMembership
from chatballs.tickets.authorization import TICKETS_MANAGE, TICKETS_VIEW
from chatballs.tickets.payloads import ticket_payload
from chatballs.tickets.selectors import get_sort_keys, list_tickets
from chatballs.tickets.services import create_ticket


class TicketListCreateView(APIView):
    """Список заявок организации с фильтрацией и создание новой заявки."""

    permission_classes = [HasCapability]
    required_capabilities = {
        "GET": TICKETS_VIEW,
        "POST": TICKETS_MANAGE,
    }

    def get(self, request: Request, **kwargs) -> Response:
        org = request.tenant_context.organization
        params = request.query_params

        assignee_id = None
        if params.get("assignee_id"):
            try:
                assignee_id = int(params["assignee_id"])
            except ValueError:
                pass

        requester_id = None
        if params.get("requester_id"):
            try:
                requester_id = int(params["requester_id"])
            except ValueError:
                pass

        group_id = None
        if params.get("group_id"):
            try:
                group_id = int(params["group_id"])
            except ValueError:
                pass

        qs = list_tickets(
            organization=org,
            status=params.get("status"),
            priority=params.get("priority"),
            assignee_id=assignee_id,
            requester_id=requester_id,
            group_id=group_id,
            search=params.get("search"),
        )

        limit = window_size(params)
        after = cursor_id(params)
        sort_keys = get_sort_keys(params.get("sort"))

        total = qs.count()
        win = window(qs, keys=sort_keys, limit=limit, after=after)

        return Response(window_payload(win, ticket_payload, total=total))

    def post(self, request: Request, **kwargs) -> Response:
        org = request.tenant_context.organization
        data = request.data or {}

        subject = data.get("subject")
        if not subject or not str(subject).strip():
            return Response(
                {"error": "validation_error", "detail": t("tickets.subject_required")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        requester_contact = None
        if data.get("requester_contact_id"):
            requester_contact = Contact.objects.filter(
                id=data["requester_contact_id"],
                organization=org,
            ).first()
            if requester_contact is None:
                return Response(
                    {"error": "not_found", "detail": t("tickets.contact_not_found")},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        assignee_membership = None
        if data.get("assignee_membership_id"):
            assignee_membership = OrganizationMembership.objects.filter(
                id=data["assignee_membership_id"],
                organization=org,
            ).first()
            if assignee_membership is None:
                return Response(
                    {"error": "not_found", "detail": t("tickets.assignee_not_found")},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        group = None
        if data.get("group_id"):
            group = EmployeeGroup.objects.filter(
                id=data["group_id"],
                organization=org,
            ).first()
            if group is None:
                return Response(
                    {"error": "not_found", "detail": t("tickets.group_not_found")},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        ticket = create_ticket(
            organization=org,
            subject=str(subject),
            description=str(data.get("description", "")),
            priority=data.get("priority", "NORMAL"),
            category=data.get("category"),
            requester_contact=requester_contact,
            assignee_membership=assignee_membership,
            group=group,
            actor_membership=request.tenant_context.membership,
        )

        return Response(ticket_payload(ticket), status=status.HTTP_201_CREATED)
