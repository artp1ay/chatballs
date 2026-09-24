"""Маршруты API маршрутизации каналов."""

from django.urls import path

from chatballs.channels import api

urlpatterns = [
    path(
        "<int:channel_id>/",
        api.ChannelRoutingView.as_view(),
        name="channel-routing",
    ),
    path(
        "<int:channel_id>/business-hours/",
        api.ChannelBusinessHoursView.as_view(),
        name="channel-business-hours",
    ),
    path(
        "<int:channel_id>/routing-rules/",
        api.ChannelRoutingRuleListView.as_view(),
        name="channel-routing-rule-list",
    ),
    path(
        "<int:channel_id>/routing-rules/reorder/",
        api.ChannelRoutingRuleReorderView.as_view(),
        name="channel-routing-rule-reorder",
    ),
    path(
        "<int:channel_id>/routing-rules/<int:rule_id>/",
        api.ChannelRoutingRuleDetailView.as_view(),
        name="channel-routing-rule-detail",
    ),
]
