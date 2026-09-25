"""Тесты конвейера Outbox, модели TicketDelivery и обработки доставок."""

from unittest.mock import patch

from django.test import TestCase

from chatballs.channels.models import Channel
from chatballs.conversations.models import Contact, Conversation
from chatballs.events.models import OutboxEvent
from chatballs.identity.bootstrap import bootstrap_owner
from chatballs.identity.models import Organization
from chatballs.tickets.event_handlers import (
    handle_delivery_dispatched,
)
from chatballs.tickets.models import (
    CustomerNoticePolicy,
    TicketDelivery,
    TicketDeliveryStatus,
    TicketPriority,
    TicketStatus,
    compute_destination_hash,
)
from chatballs.tickets.services import (
    create_ticket,
    dispatch_ticket_event,
)
from chatballs.tickets.state_machine import execute_transition


class TicketDeliveryOutboxTests(TestCase):
    def setUp(self) -> None:
        bootstrap_owner(email="outbox-owner@example.com", password="temporary-password")
        self.org = Organization.objects.get(slug="demo")
        self.membership = self.org.memberships.first()
        self.channel = Channel.objects.create(
            organization=self.org,
            code="test-support",
            name="Тестовый канал",
        )
        self.contact = Contact.objects.create(
            organization=self.org,
            name="Иван Заказчиков",
        )
        self.conversation = Conversation.objects.create(
            organization=self.org,
            channel=self.channel,
            contact=self.contact,
            external_chat_id="tg_12345678",
        )
        self.ticket = create_ticket(
            organization=self.org,
            subject="Проблема с авторизацией",
            description="Не приходит смс-код",
            priority=TicketPriority.HIGH,
            origin_conversation=self.conversation,
            actor_membership=self.membership,
        )

    def test_delivery_record_created_and_outbox_events_enqueued(self) -> None:
        """Переход статуса ставит Outbox-события и создает TicketDelivery."""
        OutboxEvent.objects.all().delete()

        execute_transition(
            self.ticket,
            target_status=TicketStatus.IN_PROGRESS,
            actor_membership=self.membership,
            customer_notice=CustomerNoticePolicy.SEND,
        )

        delivery = TicketDelivery.objects.filter(ticket=self.ticket).order_by("-id").first()
        self.assertIsNotNone(delivery)
        self.assertEqual(delivery.status, TicketDeliveryStatus.PENDING)
        self.assertEqual(delivery.customer_notice, CustomerNoticePolicy.SEND)
        self.assertEqual(
            delivery.destination_key_hash,
            compute_destination_hash(delivery.channel, delivery.destination),
        )

        # Проверяем Outbox события
        outbox_types = list(OutboxEvent.objects.values_list("event_type", flat=True))
        self.assertIn("tickets.delivery_dispatched", outbox_types)
        self.assertIn("tickets.staff_notification", outbox_types)

    def test_delivery_deduplication(self) -> None:
        """Повторный dispatch того же события не создает дубликат доставки."""
        event = self.ticket.events.first()
        first_delivery = dispatch_ticket_event(
            self.ticket,
            event,
            customer_notice=CustomerNoticePolicy.SEND,
        )
        second_delivery = dispatch_ticket_event(
            self.ticket,
            event,
            customer_notice=CustomerNoticePolicy.SEND,
        )
        self.assertEqual(first_delivery.id, second_delivery.id)
        count = TicketDelivery.objects.filter(
            event=event,
            destination_key_hash=first_delivery.destination_key_hash,
        ).count()
        self.assertEqual(count, 1)

    @patch("chatballs.tickets.services.customer_notifications.send_delivery_to_customer")
    def test_worker_handles_successful_delivery(self, mock_send) -> None:
        """Воркер успешно отправляет уведомление и переводит статус в SENT."""
        mock_send.return_value = True

        execute_transition(
            self.ticket,
            target_status=TicketStatus.IN_PROGRESS,
            actor_membership=self.membership,
            customer_notice=CustomerNoticePolicy.SEND,
        )
        delivery = TicketDelivery.objects.filter(ticket=self.ticket).order_by("-id").first()

        handle_delivery_dispatched({"delivery_id": delivery.id}, context=None)

        delivery.refresh_from_db()
        self.assertEqual(delivery.status, TicketDeliveryStatus.SENT)
        self.assertEqual(delivery.attempts, 1)
        self.assertIsNotNone(delivery.sent_at)
        mock_send.assert_called_once()

    @patch("chatballs.tickets.services.customer_notifications.send_delivery_to_customer")
    def test_worker_handles_failed_delivery_retry(self, mock_send) -> None:
        """При ошибке отправки воркер фиксирует ошибку и счетчик попыток."""
        mock_send.side_effect = ConnectionError("Connection refused")

        execute_transition(
            self.ticket,
            target_status=TicketStatus.IN_PROGRESS,
            actor_membership=self.membership,
            customer_notice=CustomerNoticePolicy.SEND,
        )
        delivery = TicketDelivery.objects.filter(ticket=self.ticket).order_by("-id").first()
        delivery.max_attempts = 2
        delivery.save(update_fields=["max_attempts"])

        # Попытка 1
        handle_delivery_dispatched({"delivery_id": delivery.id}, context=None)
        delivery.refresh_from_db()
        self.assertEqual(delivery.status, TicketDeliveryStatus.PENDING)
        self.assertEqual(delivery.attempts, 1)
        self.assertIn("Connection refused", delivery.last_error)

        # Попытка 2 (достигнут max_attempts)
        handle_delivery_dispatched({"delivery_id": delivery.id}, context=None)
        delivery.refresh_from_db()
        self.assertEqual(delivery.status, TicketDeliveryStatus.FAILED)
        self.assertEqual(delivery.attempts, 2)

    @patch("chatballs.tickets.realtime.publish")
    def test_realtime_inbox_changed_published(self, mock_publish) -> None:
        """Изменение статуса отправляет сигнал tickets.inbox.changed."""
        execute_transition(
            self.ticket,
            target_status=TicketStatus.IN_PROGRESS,
            actor_membership=self.membership,
        )
        mock_publish.assert_called_with(
            f"inbox.{self.org.id}",
            {"type": "tickets.inbox.changed"},
        )
