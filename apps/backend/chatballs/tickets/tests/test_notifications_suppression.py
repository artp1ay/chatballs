"""Тесты механизма подавления клиентских уведомлений («Галочка») и разделения потоков."""

import json
from unittest.mock import patch

from django.test import TestCase

from chatballs.channels.models import Channel
from chatballs.conversations.models import Contact, Conversation
from chatballs.identity.bootstrap import bootstrap_owner
from chatballs.identity.models import Organization
from chatballs.notifications.models import Notification, NotificationType
from chatballs.testing import TenantAPIClient
from chatballs.tickets.event_handlers import (
    handle_delivery_dispatched,
    handle_staff_notification,
)
from chatballs.tickets.models import (
    CustomerNoticePolicy,
    Ticket,
    TicketDelivery,
    TicketDeliveryStatus,
    TicketEventType,
    TicketPriority,
    TicketStatus,
)
from chatballs.tickets.services import (
    add_ticket_comment,
    create_ticket,
)
from chatballs.tickets.state_machine import execute_transition


class TicketSuppressionAndStreamsTests(TestCase):
    def setUp(self) -> None:
        bootstrap_owner(email="suppress-owner@example.com", password="temporary-password")
        self.org = Organization.objects.get(slug="demo")
        self.membership = self.org.memberships.first()
        self.channel = Channel.objects.create(
            organization=self.org,
            code="suppress-chat",
            name="Канал поддержки",
        )
        self.contact = Contact.objects.create(
            organization=self.org,
            name="Алексей Клиентов",
        )
        self.conversation = Conversation.objects.create(
            organization=self.org,
            channel=self.channel,
            contact=self.contact,
        )
        self.ticket = create_ticket(
            organization=self.org,
            subject="Тестовая заявка для подавления",
            origin_conversation=self.conversation,
            actor_membership=self.membership,
        )
        self.client = TenantAPIClient()
        self.client.login(
            username="suppress-owner@example.com",
            password="temporary-password",
        )

    def test_customer_notice_suppressed_creates_suppressed_delivery(self) -> None:
        """Подавление с причиной ставит статус SUPPRESSED и сохраняет причину в аудит-логе."""
        reason = "Внутренняя смена статуса для согласования в финотделе"
        execute_transition(
            self.ticket,
            target_status=TicketStatus.IN_PROGRESS,
            actor_membership=self.membership,
            customer_notice=CustomerNoticePolicy.SUPPRESS,
            suppression_reason=reason,
        )

        event = self.ticket.events.filter(event_type=TicketEventType.STATUS_CHANGED).last()
        self.assertFalse(event.notify_customer)
        self.assertEqual(event.suppression_reason, reason)

        delivery = TicketDelivery.objects.filter(event=event).first()
        self.assertIsNotNone(delivery)
        self.assertEqual(delivery.status, TicketDeliveryStatus.SUPPRESSED)
        self.assertEqual(delivery.customer_notice, CustomerNoticePolicy.SUPPRESS)
        self.assertEqual(delivery.suppression_reason, reason)

    @patch("chatballs.tickets.services.customer_notifications.send_delivery_to_customer")
    def test_worker_skips_transport_when_suppressed(self, mock_send) -> None:
        """Воркер не вызывает транспорт для подавленной доставки."""
        execute_transition(
            self.ticket,
            target_status=TicketStatus.IN_PROGRESS,
            actor_membership=self.membership,
            customer_notice=CustomerNoticePolicy.SUPPRESS,
            suppression_reason="Технические работы",
        )
        delivery = TicketDelivery.objects.filter(ticket=self.ticket).order_by("-id").first()

        handle_delivery_dispatched({"delivery_id": delivery.id}, context=None)

        mock_send.assert_not_called()
        delivery.refresh_from_db()
        self.assertEqual(delivery.status, TicketDeliveryStatus.SUPPRESSED)

    def test_customer_suppression_does_not_suppress_staff_notifications(self) -> None:
        """Подавление клиентского уведомления не отменяет внутреннее уведомление сотрудникам."""
        Notification.objects.all().delete()

        execute_transition(
            self.ticket,
            target_status=TicketStatus.IN_PROGRESS,
            actor_membership=self.membership,
            customer_notice=CustomerNoticePolicy.SUPPRESS,
            suppression_reason="Не тревожить клиента ночью",
        )

        event = self.ticket.events.filter(event_type=TicketEventType.STATUS_CHANGED).last()
        handle_staff_notification(
            {"ticket_id": self.ticket.id, "event_id": event.id},
            context=None,
        )

        staff_notif = Notification.objects.filter(
            organization=self.org,
            type=NotificationType.TICKET_STATUS_CHANGED,
        ).first()
        self.assertIsNotNone(staff_notif)
        self.assertEqual(staff_notif.target_id, str(self.ticket.id))

    def test_api_transition_suppress_requires_reason(self) -> None:
        """API смены статуса с customerNotice=SUPPRESS требует указания причины."""
        url = f"/api/v1/tickets/{self.ticket.id}/transition/"
        payload = {
            "target_status": TicketStatus.IN_PROGRESS,
            "customerNotice": "SUPPRESS",
            "suppressionReason": "",
        }
        resp = self.client.post(url, data=json.dumps(payload), content_type="application/json")
        self.assertEqual(resp.status_code, 400)
        data = resp.json()
        self.assertEqual(data["error"], "bad_request")

    def test_api_transition_invalid_customer_notice(self) -> None:
        """API смены статуса отвергает некорректное значение customerNotice."""
        url = f"/api/v1/tickets/{self.ticket.id}/transition/"
        payload = {
            "target_status": TicketStatus.IN_PROGRESS,
            "customerNotice": "UNKNOWN_VALUE",
        }
        resp = self.client.post(url, data=json.dumps(payload), content_type="application/json")
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()["error"], "bad_request")

    def test_api_comment_with_suppression(self) -> None:
        """API добавления комментария поддерживает подавление клиентского уведомления."""
        url = f"/api/v1/tickets/{self.ticket.id}/comments/"
        payload = {
            "text": "Внутренняя пометка оператора в переписке",
            "is_public": True,
            "customerNotice": "SUPPRESS",
            "suppressionReason": "Уточнение данных у поставщика",
        }
        resp = self.client.post(url, data=json.dumps(payload), content_type="application/json")
        self.assertEqual(resp.status_code, 201)

        event = self.ticket.events.filter(event_type=TicketEventType.COMMENT_ADDED).last()
        self.assertEqual(event.suppression_reason, "Уточнение данных у поставщика")
        self.assertFalse(event.notify_customer)

        delivery = TicketDelivery.objects.filter(event=event).first()
        self.assertIsNotNone(delivery)
        self.assertEqual(delivery.status, TicketDeliveryStatus.SUPPRESSED)
