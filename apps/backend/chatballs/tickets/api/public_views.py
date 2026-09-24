"""Публичные представления для гостевого доступа клиентов к заявкам."""

from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from chatballs.i18n import t
from chatballs.tickets.models.ticket import Ticket
from chatballs.tickets.payloads import (
    ticket_comment_payload,
    ticket_public_payload,
)
from chatballs.tickets.selectors import ticket_comments
from chatballs.tickets.services import add_ticket_comment, resolve_public_ticket


class PublicTicketDetailView(APIView):
    """Публичный просмотр состояния заявки и открытых комментариев по токену."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request: Request, token: str, **kwargs) -> Response:
        try:
            ticket = resolve_public_ticket(token)
        except Ticket.DoesNotExist:
            return Response(
                {"error": "not_found", "detail": t("tickets.public_ticket_not_found")},
                status=status.HTTP_404_NOT_FOUND,
            )

        comments = ticket_comments(ticket, public_only=True)
        return Response(
            {
                "ticket": ticket_public_payload(ticket),
                "comments": [ticket_comment_payload(c) for c in comments],
            }
        )


class PublicTicketCommentView(APIView):
    """Добавление публичного комментария клиентом по токену."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request: Request, token: str, **kwargs) -> Response:
        try:
            ticket = resolve_public_ticket(token)
        except Ticket.DoesNotExist:
            return Response(
                {"error": "not_found", "detail": t("tickets.public_ticket_not_found")},
                status=status.HTTP_404_NOT_FOUND,
            )

        data = request.data or {}
        text = str(data.get("text", "")).strip()
        if not text:
            return Response(
                {"error": "validation_error", "detail": t("tickets.comment_text_required")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        comment = add_ticket_comment(
            ticket,
            text=text,
            author_contact=ticket.requester_contact,
            is_public=True,
        )
        return Response(ticket_comment_payload(comment), status=status.HTTP_201_CREATED)


TicketPublicDetailView = PublicTicketDetailView

