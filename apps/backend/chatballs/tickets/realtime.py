"""Realtime-оповещения модуля заявок Helpdesk."""

from __future__ import annotations

from chatballs.conversations.realtime import inbox_group
from chatballs.realtime import publish

TICKETS_INBOX_EVENT = "tickets.inbox.changed"


def notify_tickets_inbox_changed(organization_id: int) -> None:
    """Уведомить подключенных клиентов организации об изменении заявок."""
    publish(inbox_group(organization_id), {"type": TICKETS_INBOX_EVENT})
