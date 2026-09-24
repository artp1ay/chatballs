"""Сервис гостевого публичного доступа к заявкам."""

from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta

from django.core.exceptions import ObjectDoesNotExist
from django.utils import timezone

from chatballs.tickets.models.access import TicketPublicAccess
from chatballs.tickets.models.ticket import Ticket


def hash_public_token(raw_token: str) -> str:
    """Хэширование сырого токена SHA-256 для безопасного хранения в БД."""
    return hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()


def get_or_create_public_token(
    ticket: Ticket,
    *,
    expires_in_days: int = 30,
) -> str:
    """Генерация или перевыпуск токена гостевого доступа. Возвращает открытый токен."""
    raw_token = secrets.token_urlsafe(32)
    token_hash = hash_public_token(raw_token)
    expires_at = timezone.now() + timedelta(days=expires_in_days)

    access, created = TicketPublicAccess.objects.get_or_create(
        ticket=ticket,
        defaults={
            "organization": ticket.organization,
            "token_hash": token_hash,
            "expires_at": expires_at,
            "is_active": True,
        },
    )
    if not created:
        access.token_hash = token_hash
        access.expires_at = expires_at
        access.is_active = True
        access.save(update_fields=["token_hash", "expires_at", "is_active"])

    return raw_token


def resolve_public_ticket(raw_token: str) -> Ticket:
    """Поиск тикета по гостевому токену с проверкой активности и срока действия."""
    token_hash = hash_public_token(raw_token)
    try:
        access = (
            TicketPublicAccess.objects.select_related("ticket", "ticket__organization")
            .filter(
                token_hash=token_hash,
                is_active=True,
            )
            .get()
        )
    except ObjectDoesNotExist:
        raise Ticket.DoesNotExist("Ticket not found for given token") from None

    if access.expires_at is not None and access.expires_at < timezone.now():
        raise Ticket.DoesNotExist("Ticket access token has expired")

    return access.ticket
