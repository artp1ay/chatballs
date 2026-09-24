"""Создание заявки напрямую из диалога оперативного чата."""

from __future__ import annotations

from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from chatballs.api.permissions import HasCapability
from chatballs.conversations.models import Conversation
from chatballs.i18n import t
from chatballs.identity.group_models import EmployeeGroup
from chatballs.identity.models import OrganizationMembership
from chatballs.tickets.authorization import TICKETS_MANAGE
from chatballs.tickets.payloads import ticket_payload
from chatballs.tickets.services import create_ticket_from_conversation


class ConversationCreateTicketView(APIView):
    """Эндпоинт создания заявки из существующего диалога оперативного чата."""

    permission_classes = [HasCapability]
    required_capability = TICKETS_MANAGE

    def post(self, request: Request, conversation_id: int, **kwargs) -> Response:
        org = request.tenant_context.organization
        conversation = (
            Conversation.objects.filter(
                id=conversation_id,
                organization=org,
            )
            .select_related("contact", "channel")
            .first()
        )
        if conversation is None:
            return Response(
                {"error": "not_found", "detail": t("conversations.not_found")},
                status=status.HTTP_404_NOT_FOUND,
            )

        data = request.data or {}
        subject = data.get("subject")
        if not subject or not str(subject).strip():
            return Response(
                {"error": "validation_error", "detail": t("tickets.subject_required")},
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

        ticket = create_ticket_from_conversation(
            conversation,
            subject=str(subject),
            description=str(data.get("description", "")),
            priority=data.get("priority", "NORMAL"),
            category=data.get("category"),
            assignee_membership=assignee_membership,
            group=group,
            actor_membership=request.tenant_context.membership,
        )

        return Response(ticket_payload(ticket), status=status.HTTP_201_CREATED)
