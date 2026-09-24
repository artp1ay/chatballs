"""Представления для заметок, комментариев, аудита и гостевого доступа."""

from __future__ import annotations

from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from chatballs.api.permissions import HasCapability
from chatballs.i18n import t
from chatballs.tickets.authorization import TICKETS_MANAGE, TICKETS_VIEW
from chatballs.tickets.models.ticket import Ticket
from chatballs.tickets.payloads import (
    ticket_comment_payload,
    ticket_event_payload,
    ticket_note_payload,
)
from chatballs.tickets.selectors import (
    ticket_comments,
    ticket_events,
    ticket_for_organization,
    ticket_notes,
)
from chatballs.tickets.services import (
    add_ticket_comment,
    add_ticket_note,
    get_or_create_public_token,
)


def _get_ticket(request: Request, ticket_id: int) -> Ticket | None:
    org = request.tenant_context.organization
    try:
        return ticket_for_organization(org, ticket_id)
    except Ticket.DoesNotExist:
        return None


class TicketNoteView(APIView):
    """Список внутренних заметок и создание новой заметки сотрудником."""

    permission_classes = [HasCapability]
    required_capabilities = {
        "GET": TICKETS_VIEW,
        "POST": TICKETS_MANAGE,
    }

    def get(self, request: Request, ticket_id: int, **kwargs) -> Response:
        ticket = _get_ticket(request, ticket_id)
        if ticket is None:
            return Response(
                {"error": "not_found", "detail": t("tickets.not_found")},
                status=status.HTTP_404_NOT_FOUND,
            )
        notes = ticket_notes(ticket)
        return Response([ticket_note_payload(n) for n in notes])

    def post(self, request: Request, ticket_id: int, **kwargs) -> Response:
        ticket = _get_ticket(request, ticket_id)
        if ticket is None:
            return Response(
                {"error": "not_found", "detail": t("tickets.not_found")},
                status=status.HTTP_404_NOT_FOUND,
            )

        data = request.data or {}
        text = str(data.get("text", "")).strip()
        if not text:
            return Response(
                {"error": "validation_error", "detail": t("tickets.note_text_required")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        note = add_ticket_note(
            ticket,
            author_membership=request.tenant_context.membership,
            text=text,
        )
        return Response(ticket_note_payload(note), status=status.HTTP_201_CREATED)


class TicketCommentView(APIView):
    """Список комментариев к заявке и добавление нового комментария."""

    permission_classes = [HasCapability]
    required_capabilities = {
        "GET": TICKETS_VIEW,
        "POST": TICKETS_MANAGE,
    }

    def get(self, request: Request, ticket_id: int, **kwargs) -> Response:
        ticket = _get_ticket(request, ticket_id)
        if ticket is None:
            return Response(
                {"error": "not_found", "detail": t("tickets.not_found")},
                status=status.HTTP_404_NOT_FOUND,
            )
        comments = ticket_comments(ticket)
        return Response([ticket_comment_payload(c) for c in comments])

    def post(self, request: Request, ticket_id: int, **kwargs) -> Response:
        ticket = _get_ticket(request, ticket_id)
        if ticket is None:
            return Response(
                {"error": "not_found", "detail": t("tickets.not_found")},
                status=status.HTTP_404_NOT_FOUND,
            )

        data = request.data or {}
        text = str(data.get("text", "")).strip()
        if not text:
            return Response(
                {"error": "validation_error", "detail": t("tickets.comment_text_required")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        is_public = bool(data.get("is_public", True))
        comment = add_ticket_comment(
            ticket,
            text=text,
            author_membership=request.tenant_context.membership,
            is_public=is_public,
        )
        return Response(ticket_comment_payload(comment), status=status.HTTP_201_CREATED)


class TicketEventView(APIView):
    """Журнал аудита событий по заявке."""

    permission_classes = [HasCapability]
    required_capability = TICKETS_VIEW

    def get(self, request: Request, ticket_id: int, **kwargs) -> Response:
        ticket = _get_ticket(request, ticket_id)
        if ticket is None:
            return Response(
                {"error": "not_found", "detail": t("tickets.not_found")},
                status=status.HTTP_404_NOT_FOUND,
            )
        events = ticket_events(ticket)
        return Response([ticket_event_payload(e) for e in events])


class TicketPublicAccessView(APIView):
    """Генерация или перевыпуск гостевого токена доступа к заявке."""

    permission_classes = [HasCapability]
    required_capability = TICKETS_MANAGE

    def post(self, request: Request, ticket_id: int, **kwargs) -> Response:
        ticket = _get_ticket(request, ticket_id)
        if ticket is None:
            return Response(
                {"error": "not_found", "detail": t("tickets.not_found")},
                status=status.HTTP_404_NOT_FOUND,
            )

        token = get_or_create_public_token(ticket)
        return Response({"token": token}, status=status.HTTP_200_OK)


TicketNotesView = TicketNoteView
TicketCommentsView = TicketCommentView
TicketEventsView = TicketEventView

