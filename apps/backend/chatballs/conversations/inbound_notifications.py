"""Уведомления операторов о входящем сообщении."""

from __future__ import annotations

from chatballs.conversations.models import Contact, Conversation
from chatballs.conversations.queue import is_waiting
from chatballs.i18n import t
from chatballs.notifications.models import NotificationAudience, NotificationType
from chatballs.notifications.services import notify
from chatballs.tenancy.context import TenantContext


def notify_new_dialog(
    *,
    context: TenantContext,
    channel,
    contact: Contact,
    integration,
    conversation: Conversation,
    message_text: str,
) -> None:
    """Оповещает о новом диалоге с учётом выбранного исполнителя."""

    notify(
        context=context,
        type=(
            NotificationType.OPERATOR_REQUESTED
            if is_waiting(conversation)
            else NotificationType.NEW_DIALOG
        ),
        audience=NotificationAudience.OPERATORS,
        audience_group=conversation.group,
        title=f"Новый диалог · {channel.name}",
        body=f"{contact.name or 'Гость'} · {integration.provider}: {message_text[:80]}",
        title_key="notifications.new_dialog",
        body_key="notifications.new_dialog_body",
        text_params={
            "channel": channel.name,
            "contact": contact.name or t("conversations.guest"),
            "provider": integration.provider,
            "preview": message_text[:80],
        },
        target_id=conversation.id,
        source_type="Conversation",
        source_id=conversation.id,
        dedup_key=f"dialog:{conversation.id}",
    )


def notify_new_message(
    *,
    context: TenantContext,
    contact: Contact,
    integration,
    conversation: Conversation,
    external_id: str,
    message_text: str,
) -> None:
    """Оповещает назначенного сотрудника или общую группу операторов."""

    operator = conversation.assigned_operator
    notify(
        context=context,
        type=NotificationType.DIALOG_NEW_MESSAGE,
        audience=NotificationAudience.USER if operator else NotificationAudience.OPERATORS,
        audience_group=conversation.group,
        recipient_user=operator,
        title=f"Новое сообщение · {contact.name or 'Гость'}",
        body=message_text[:120],
        title_key="notifications.new_message",
        text_params={"contact": contact.name or t("conversations.guest")},
        target_id=conversation.id,
        source_type="Conversation",
        source_id=conversation.id,
        dedup_key=f"msg:{integration.id}:{external_id}",
    )


def notify_media_operator(
    *,
    context: TenantContext,
    contact: Contact,
    conversation: Conversation,
    message_text: str,
) -> None:
    """Оповещает операторов о вложении, на которое AI не сможет ответить."""

    notify(
        context=context,
        type=NotificationType.OPERATOR_REQUESTED,
        audience=NotificationAudience.OPERATORS,
        audience_group=conversation.group,
        title=f"Нужен оператор · {contact.name or 'Гость'}",
        title_key="notifications.operator_needed",
        text_params={"contact": contact.name or t("conversations.guest")},
        body=message_text[:120],
        target_id=conversation.id,
        source_type="Conversation",
        source_id=conversation.id,
        dedup_key=f"media:{conversation.id}",
    )
