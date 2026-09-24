"""Маршрутизация внутренних REST API эндпоинтов модуля заявок."""

from django.urls import path

from chatballs.tickets.api.activity_views import (
    TicketCommentView,
    TicketEventView,
    TicketNoteView,
    TicketPublicAccessView,
)
from chatballs.tickets.api.ticket_detail_views import (
    TicketDetailView,
    TicketTransitionView,
)
from chatballs.tickets.api.ticket_list_views import TicketListCreateView

urlpatterns = [
    path("", TicketListCreateView.as_view(), name="ticket-list"),
    path("<int:ticket_id>/", TicketDetailView.as_view(), name="ticket-detail"),
    path("<int:ticket_id>/transitions/", TicketTransitionView.as_view(), name="ticket-transitions"),
    path("<int:ticket_id>/notes/", TicketNoteView.as_view(), name="ticket-notes"),
    path("<int:ticket_id>/comments/", TicketCommentView.as_view(), name="ticket-comments"),
    path("<int:ticket_id>/events/", TicketEventView.as_view(), name="ticket-events"),
    path("<int:ticket_id>/public-access/", TicketPublicAccessView.as_view(), name="ticket-public-access"),
]
