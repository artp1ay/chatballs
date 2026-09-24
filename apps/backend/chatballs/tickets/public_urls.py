"""Маршрутизация публичных эндпоинтов гостевого доступа к заявкам."""

from django.urls import path

from chatballs.tickets.api.public_views import (
    PublicTicketCommentView,
    PublicTicketDetailView,
)

urlpatterns = [
    path("<str:token>/", PublicTicketDetailView.as_view(), name="public-ticket-detail"),
    path("<str:token>/comments/", PublicTicketCommentView.as_view(), name="public-ticket-comments"),
]
