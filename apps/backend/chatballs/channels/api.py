"""REST API режима, расписания и правил маршрутизации канала."""

from __future__ import annotations

from typing import Any

from django.core.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from chatballs.api.permissions import HasCapability
from chatballs.channels import routing_payloads as payloads
from chatballs.channels import routing_services as services
from chatballs.channels.authorization import CHANNELS_MANAGE, CHANNELS_VIEW
from chatballs.channels.models import Channel, ChannelRoutingRule


class ChannelRoutingView(APIView):
    permission_classes = [HasCapability]
    required_capabilities = {
        "GET": CHANNELS_VIEW,
        "PATCH": CHANNELS_MANAGE,
    }

    def get(self, request: Request, channel_id: int) -> Response:
        channel = _channel(request, channel_id, CHANNELS_VIEW)
        if channel is None:
            return _not_found()
        return Response(payloads.channel_payload(channel))

    def patch(self, request: Request, channel_id: int) -> Response:
        channel = _channel(request, channel_id, CHANNELS_MANAGE)
        if channel is None:
            return _not_found()
        data = _body(request)
        value = data.get("routing_mode", data.get("routingMode"))
        if value is None:
            return Response({"detail": "Нужно указать routing_mode"}, status=400)
        try:
            channel = services.change_routing_mode(
                context=request.tenant_context,
                channel=channel,
                value=value,
            )
        except ValidationError as error:
            return _validation_response(error)
        return Response(payloads.channel_payload(channel))


class ChannelBusinessHoursView(APIView):
    permission_classes = [HasCapability]
    required_capabilities = {
        "GET": CHANNELS_VIEW,
        "PUT": CHANNELS_MANAGE,
        "PATCH": CHANNELS_MANAGE,
    }

    def get(self, request: Request, channel_id: int) -> Response:
        channel = _channel(request, channel_id, CHANNELS_VIEW)
        if channel is None:
            return _not_found()
        hours = services.get_business_hours(channel=channel)
        if hours is None:
            return _not_found("Расписание канала не настроено")
        return Response(payloads.business_hours_payload(hours))

    def put(self, request: Request, channel_id: int) -> Response:
        return self._save(request, channel_id)

    def patch(self, request: Request, channel_id: int) -> Response:
        return self._save(request, channel_id)

    def _save(self, request: Request, channel_id: int) -> Response:
        channel = _channel(request, channel_id, CHANNELS_MANAGE)
        if channel is None:
            return _not_found()
        try:
            hours = services.save_business_hours(
                context=request.tenant_context,
                channel=channel,
                data=_body(request),
            )
        except (ValidationError, ValueError) as error:
            return _validation_response(error)
        return Response(payloads.business_hours_payload(hours))


class ChannelRoutingRuleListView(APIView):
    permission_classes = [HasCapability]
    required_capabilities = {"GET": CHANNELS_VIEW, "POST": CHANNELS_MANAGE}

    def get(self, request: Request, channel_id: int) -> Response:
        channel = _channel(request, channel_id, CHANNELS_VIEW)
        if channel is None:
            return _not_found()
        rules = services.list_rules(channel=channel)
        return Response({"items": [payloads.rule_payload(rule) for rule in rules]})

    def post(self, request: Request, channel_id: int) -> Response:
        channel = _channel(request, channel_id, CHANNELS_MANAGE)
        if channel is None:
            return _not_found()
        try:
            rule = services.create_rule(
                context=request.tenant_context,
                channel=channel,
                data=_body(request),
            )
        except ValidationError as error:
            return _validation_response(error)
        return Response(payloads.rule_payload(rule), status=201)


class ChannelRoutingRuleReorderView(APIView):
    permission_classes = [HasCapability]
    required_capability = CHANNELS_MANAGE

    def post(self, request: Request, channel_id: int) -> Response:
        channel = _channel(request, channel_id, CHANNELS_MANAGE)
        if channel is None:
            return _not_found()
        try:
            count = services.reorder_rules(
                context=request.tenant_context,
                channel=channel,
                rule_ids=_body(request).get("rule_ids"),
            )
        except ValidationError as error:
            return _validation_response(error)
        return Response({"updated_count": count})


class ChannelRoutingRuleDetailView(APIView):
    permission_classes = [HasCapability]
    required_capabilities = {
        "GET": CHANNELS_VIEW,
        "PUT": CHANNELS_MANAGE,
        "PATCH": CHANNELS_MANAGE,
        "DELETE": CHANNELS_MANAGE,
    }

    def get(self, request: Request, channel_id: int, rule_id: int) -> Response:
        rule = _rule(request, channel_id, rule_id, CHANNELS_VIEW)
        if rule is None:
            return _not_found("Правило маршрутизации не найдено")
        return Response(payloads.rule_payload(rule))

    def put(self, request: Request, channel_id: int, rule_id: int) -> Response:
        return self.patch(request, channel_id, rule_id)

    def patch(self, request: Request, channel_id: int, rule_id: int) -> Response:
        channel = _channel(request, channel_id, CHANNELS_MANAGE)
        if channel is None:
            return _not_found()
        try:
            rule = services.update_rule(
                context=request.tenant_context,
                channel=channel,
                rule_id=rule_id,
                data=_body(request),
            )
        except ChannelRoutingRule.DoesNotExist:
            return _not_found("Правило маршрутизации не найдено")
        except ValidationError as error:
            return _validation_response(error)
        return Response(payloads.rule_payload(rule))

    def delete(self, request: Request, channel_id: int, rule_id: int) -> Response:
        channel = _channel(request, channel_id, CHANNELS_MANAGE)
        if channel is None:
            return _not_found()
        try:
            services.delete_rule(
                context=request.tenant_context,
                channel=channel,
                rule_id=rule_id,
            )
        except ChannelRoutingRule.DoesNotExist:
            return _not_found("Правило маршрутизации не найдено")
        return Response(status=204)


def _body(request: Request) -> dict[str, Any]:
    return request.data if isinstance(request.data, dict) else {}


def _channel(request: Request, channel_id: int, capability: str) -> Channel | None:
    try:
        return services.get_channel(
            context=request.tenant_context,
            channel_id=channel_id,
            capability=capability,
        )
    except Channel.DoesNotExist:
        return None


def _rule(
    request: Request, channel_id: int, rule_id: int, capability: str
) -> ChannelRoutingRule | None:
    channel = _channel(request, channel_id, capability)
    if channel is None:
        return None
    try:
        return services.get_rule(channel=channel, rule_id=rule_id)
    except ChannelRoutingRule.DoesNotExist:
        return None


def _validation_response(error: Exception) -> Response:
    if isinstance(error, ValidationError):
        if hasattr(error, "message_dict"):
            detail = "; ".join(
                message
                for messages in error.message_dict.values()
                for message in messages
            )
        else:
            detail = "; ".join(error.messages)
    else:
        detail = str(error)
    return Response({"detail": detail}, status=400)


def _not_found(detail: str = "Канал не найден") -> Response:
    return Response({"detail": detail}, status=404)
