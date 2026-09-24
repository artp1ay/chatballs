"""Ход AI как отдельная работа: приём не ждёт модель, ответ считается событием."""

from unittest import mock

from django.test import TestCase, override_settings

from chatballs.ai.models import AIAgent, AIAgentStatus
from chatballs.ai.provider.base import ChatResult
from chatballs.ai.runtime import HANDOFF_TOKEN
from chatballs.ai.turn import TurnAnswer
from chatballs.channels.models import Channel
from chatballs.conversations.ai_turn import AI_TURN_REQUESTED, request_ai_turn
from chatballs.conversations.ingest import ingest_inbound
from chatballs.conversations.models import (
    AiTurnState,
    ControlMode,
    ExpectedResponder,
    Message,
    MessageAuthor,
    SystemEvent,
)
from chatballs.conversations.services import claim_conversation
from chatballs.conversations.transports.base import InboundMessage
from chatballs.events.handlers import dispatch
from chatballs.events.models import OutboxEvent
from chatballs.identity.bootstrap import bootstrap_owner
from chatballs.identity.models import HumanUser, Organization
from chatballs.integrations.models import Integration, IntegrationKind, IntegrationProvider
from chatballs.testing import ai_answer, ai_failure, run_pending_ai_turns, tenant_context_for


class AiTurnQueueTests(TestCase):
    def setUp(self) -> None:
        bootstrap_owner(email="owner@example.com", password="temporary-password")
        self.organization = Organization.objects.get(slug="demo")
        self.channel = Channel.objects.create(
            organization=self.organization, code="line", name="Линия"
        )
        AIAgent.objects.create(
            channel=self.channel,
            name="Агент",
            model="openai/gpt-4o-mini",
            status=AIAgentStatus.ACTIVE,
        )
        self.integration = Integration.objects.create(
            organization=self.organization,
            kind=IntegrationKind.MESSENGER,
            provider=IntegrationProvider.TELEGRAM,
            name="Bot",
            secret="token",
            channel=self.channel,
        )
        self.inbound = InboundMessage(
            external_id="ext-1",
            user_id="u-1",
            chat_id="c-1",
            text="Здравствуйте",
            display_name="Гость",
        )

    def _inbound_message(self) -> Message:
        return Message.objects.get(author_type=MessageAuthor.CONTACT)

    def _ai_messages(self):
        return Message.objects.filter(author_type=MessageAuthor.AI)

    def test_ingest_queues_the_turn_and_does_not_call_the_model(self) -> None:
        # Главное свойство всей развязки: приём не ждёт провайдера.
        with mock.patch("chatballs.ai.provider.local.LocalProvider.chat") as chat:
            ingest_inbound(self.integration, self.inbound)

        chat.assert_not_called()
        message = self._inbound_message()
        self.assertEqual(message.ai_turn_state, AiTurnState.PENDING)
        self.assertFalse(self._ai_messages().exists())
        self.assertTrue(
            OutboxEvent.objects.filter(
                event_type=AI_TURN_REQUESTED, aggregate_id=str(message.conversation_id)
            ).exists()
        )

    def test_turn_answers_and_closes_the_message(self) -> None:
        with (
            ai_answer("Здравствуйте!"),
            mock.patch(
                "chatballs.conversations.transports.send_reply", return_value=True
            ) as send,
        ):
            ingest_inbound(self.integration, self.inbound)
            self.assertEqual(run_pending_ai_turns(), 1)

        self.assertEqual(self._ai_messages().get().text, "Здравствуйте!")
        self.assertEqual(self._inbound_message().ai_turn_state, AiTurnState.DONE)
        conversation = self.channel.conversations.get()
        self.assertEqual(conversation.control_mode, ControlMode.AI)
        self.assertEqual(conversation.expected_responder, ExpectedResponder.CUSTOMER)
        send.assert_called_once()

    def test_provider_failure_for_active_turn_still_goes_to_operator(self) -> None:
        with (
            ai_failure(),
            mock.patch(
                "chatballs.conversations.transports.send_reply", return_value=True
            ) as send,
        ):
            ingest_inbound(self.integration, self.inbound)
            self.assertEqual(run_pending_ai_turns(), 1)

        conversation = self.channel.conversations.get()
        self.assertEqual(conversation.control_mode, ControlMode.PAUSED)
        self.assertEqual(conversation.expected_responder, ExpectedResponder.OPERATOR)
        self.assertEqual(self._inbound_message().ai_turn_state, AiTurnState.FAILED)
        self.assertTrue(self._ai_messages().filter(text__contains="специалисту").exists())
        send.assert_called_once()

    def test_handoff_for_active_turn_still_enters_operator_queue(self) -> None:
        with (
            ai_answer(f"Передаю вопрос\n{HANDOFF_TOKEN}"),
            mock.patch(
                "chatballs.conversations.transports.send_reply", return_value=True
            ) as send,
        ):
            ingest_inbound(self.integration, self.inbound)
            self.assertEqual(run_pending_ai_turns(), 1)

        conversation = self.channel.conversations.get()
        self.assertEqual(conversation.control_mode, ControlMode.PAUSED)
        self.assertEqual(conversation.expected_responder, ExpectedResponder.OPERATOR)
        self.assertIsNotNone(conversation.waiting_since)
        self.assertTrue(
            conversation.messages.filter(system_event=SystemEvent.AI_HANDED_OVER).exists()
        )
        send.assert_called_once()

    def test_repeated_delivery_does_not_answer_twice(self) -> None:
        # Событие могут привезти второй раз: процесс упал между ответом и
        # отметкой о нём. Второй ответ клиенту — это хуже, чем ни одного.
        with (
            ai_answer("Здравствуйте!"),
            mock.patch("chatballs.conversations.transports.send_reply", return_value=True),
        ):
            ingest_inbound(self.integration, self.inbound)
            event = OutboxEvent.objects.get(event_type=AI_TURN_REQUESTED)
            dispatch(event)
            dispatch(event)

        self.assertEqual(self._ai_messages().count(), 1)

    def test_turn_for_a_dialog_taken_by_an_operator_is_dropped(self) -> None:
        with (
            ai_answer("Здравствуйте!"),
            mock.patch("chatballs.conversations.transports.send_reply", return_value=True),
        ):
            ingest_inbound(self.integration, self.inbound)
            conversation = self.channel.conversations.get()
            conversation.control_mode = ControlMode.HUMAN
            conversation.save(update_fields=["control_mode"])
            run_pending_ai_turns()

        self.assertFalse(self._ai_messages().exists())
        self.assertEqual(self._inbound_message().ai_turn_state, AiTurnState.DONE)

    def test_request_after_operator_claim_does_not_requeue_old_message(self) -> None:
        with mock.patch("chatballs.conversations.ingest.request_ai_turn"):
            ingest_inbound(self.integration, self.inbound)

        message = self._inbound_message()
        conversation = self.channel.conversations.get()
        owner = HumanUser.objects.get(email="owner@example.com")
        context = tenant_context_for(owner, self.organization)
        claim_conversation(context=context, conversation_id=conversation.id)

        request_ai_turn(message=message, user_id="u-1", context=context)

        message.refresh_from_db()
        self.assertEqual(message.ai_turn_state, AiTurnState.DONE)
        self.assertFalse(OutboxEvent.objects.filter(event_type=AI_TURN_REQUESTED).exists())
        self.assertEqual(run_pending_ai_turns(), 0)
        conversation.refresh_from_db()
        self.assertEqual(conversation.control_mode, ControlMode.HUMAN)

    def test_agent_disabled_during_model_call_cancels_result(self) -> None:
        def answer_after_disable(_plan):
            agent = AIAgent.objects.get(channel=self.channel)
            agent.status = AIAgentStatus.DISABLED
            agent.lifecycle_version += 1
            agent.save(update_fields=["status", "lifecycle_version"])
            return TurnAnswer(
                result=ChatResult(
                    text="Ответ отключённого агента",
                    model="test",
                    prompt_tokens=1,
                    completion_tokens=1,
                )
            )

        with (
            mock.patch("chatballs.conversations.ai_turn.run_turn_chat", side_effect=answer_after_disable),
            mock.patch(
                "chatballs.conversations.transports.send_reply", return_value=True
            ) as send,
        ):
            ingest_inbound(self.integration, self.inbound)
            self.assertEqual(run_pending_ai_turns(), 1)

        conversation = self.channel.conversations.get()
        self.assertFalse(self._ai_messages().exists())
        send.assert_not_called()
        self.assertEqual(self._inbound_message().ai_turn_state, AiTurnState.DONE)
        self.assertEqual(conversation.control_mode, ControlMode.AI)
        self.assertEqual(conversation.expected_responder, ExpectedResponder.AI)

    def test_result_returned_after_operator_claim_is_discarded(self) -> None:
        """Перехват во время внешнего вызова отменяет уже готовый ответ AI."""

        ingest_inbound(self.integration, self.inbound)
        conversation = self.channel.conversations.get()
        owner = HumanUser.objects.get(email="owner@example.com")
        context = tenant_context_for(owner, self.organization)
        model_call = mock.Mock()

        def answer_after_claim(_plan):
            claim_conversation(context=context, conversation_id=conversation.id)
            model_call()
            return TurnAnswer(
                result=ChatResult(
                    text="Ответ, который уже не актуален",
                    model="test",
                    prompt_tokens=1,
                    completion_tokens=1,
                )
            )

        with (
            mock.patch("chatballs.conversations.ai_turn.run_turn_chat", side_effect=answer_after_claim),
            mock.patch("chatballs.conversations.ai_turn._deliver") as deliver,
            mock.patch(
                "chatballs.conversations.transports.send_reply", return_value=True
            ) as send,
        ):
            self.assertEqual(run_pending_ai_turns(), 1)
            # Повторная доставка того же события тоже не должна запускать модель.
            dispatch(OutboxEvent.objects.get(event_type=AI_TURN_REQUESTED))

        conversation.refresh_from_db()
        message = self._inbound_message()
        self.assertFalse(self._ai_messages().exists())
        send.assert_not_called()
        deliver.assert_not_called()
        model_call.assert_called_once()
        self.assertEqual(message.ai_turn_state, AiTurnState.DONE)
        self.assertEqual(conversation.control_mode, ControlMode.HUMAN)
        self.assertEqual(conversation.expected_responder, ExpectedResponder.OPERATOR)
        self.assertEqual(conversation.assigned_operator_id, owner.id)
        self.assertIsNone(conversation.waiting_since)

    @override_settings(CHATBALLS_AI_TURN_DEADLINE_SECONDS=0)
    def test_expired_turn_goes_to_the_operator_instead_of_the_model(self) -> None:
        # Ответ, пролежавший в очереди, клиенту уже не нужен — нужен человек.
        with (
            mock.patch("chatballs.ai.provider.local.LocalProvider.chat") as chat,
            mock.patch(
                "chatballs.conversations.transports.send_reply", return_value=True
            ) as send,
        ):
            ingest_inbound(self.integration, self.inbound)
            run_pending_ai_turns()

        chat.assert_not_called()
        conversation = self.channel.conversations.get()
        self.assertEqual(conversation.control_mode, ControlMode.PAUSED)
        self.assertEqual(conversation.expected_responder, ExpectedResponder.OPERATOR)
        self.assertEqual(self._inbound_message().ai_turn_state, AiTurnState.FAILED)
        self.assertTrue(self._ai_messages().filter(text__contains="специалисту").exists())
        # Клиент получает этот текст в своём канале, а не только в базе.
        send.assert_called_once()
