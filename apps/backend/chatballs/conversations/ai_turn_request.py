"""Постановка входящего AI-хода в очередь с защитой от перехвата."""

from __future__ import annotations

from chatballs.conversations import ai_turn_result
from chatballs.conversations.models import (
    AiTurnState,
    ControlMode,
    LifecycleState,
    Message,
)
from chatballs.events.services import DomainEvent, enqueue_event
from chatballs.tenancy.context import TenantContext
from chatballs.tenancy.database import tenant_atomic

AI_TURN_REQUESTED = "conversation.ai_turn_requested"
# Агрегат события — диалог: ходы одного диалога обрабатываются строго по
# очереди (chatballs.events.services.claim_next_outbox_event).
AGGREGATE_TYPE = "Conversation"


def request_ai_turn(
    *,
    message: Message,
    user_id: str,
    context: TenantContext,
    is_new_conversation: bool = False,
) -> None:
    """Атомарно поставить ход в очередь, если диалог всё ещё ведёт AI."""

    with tenant_atomic(context):
        locked = ai_turn_result.lock_turn_for_start(
            message_id=message.pk,
            context=context,
        )
        if locked is None:
            return
        conversation, current_message = locked
        agent = getattr(conversation.channel, "ai_agent", None)
        if (
            conversation.lifecycle != LifecycleState.OPEN
            or conversation.control_mode != ControlMode.AI
            or agent is None
            or not agent.is_active
        ):
            if current_message.ai_turn_state in (
                AiTurnState.NONE,
                AiTurnState.PENDING,
                AiTurnState.RUNNING,
            ):
                current_message.ai_turn_state = AiTurnState.DONE
                current_message.save(update_fields=["ai_turn_state"])
            return

        # Не возвращаем завершённый или уже выполняющийся ход в PENDING.
        if current_message.ai_turn_state != AiTurnState.NONE:
            return
        current_message.ai_turn_state = AiTurnState.PENDING
        current_message.save(update_fields=["ai_turn_state"])
        enqueue_event(
            DomainEvent(
                aggregate_type=AGGREGATE_TYPE,
                aggregate_id=str(conversation.id),
                event_type=AI_TURN_REQUESTED,
                payload={
                    "messageId": current_message.id,
                    "userId": user_id,
                    # Про новый диалог операторов уже позвали при приёме: второй
                    # оклик из-за нерасшифрованного голосового был бы лишним.
                    "isNewConversation": is_new_conversation,
                },
                tenant_context=context,
            )
        )
