"""Сервисы создания заявок и генерации номеров."""

from __future__ import annotations

from django.db import transaction

from chatballs.conversations.models import Contact, Conversation
from chatballs.identity.group_models import EmployeeGroup
from chatballs.identity.models import Organization, OrganizationMembership
from chatballs.tickets.models.activities import (
    TicketEvent,
    TicketEventType,
)
from chatballs.tickets.models.links import (
    TicketContactLink,
    TicketConversationLink,
)
from chatballs.tickets.models.settings import (
    HeldeskSettings,
    TicketNumberCounter,
)
from chatballs.tickets.models.ticket import (
    Ticket,
    TicketPriority,
    TicketStatus,
)


def generate_ticket_number(
    organization: Organization,
    prefix: str | None = None,
) -> str:
    """Генерация следующего номера заявки с блокировкой счётчика."""
    return TicketNumberCounter.allocate_number(organization, prefix=prefix)


def create_ticket(
    *,
    organization: Organization,
    subject: str,
    description: str = "",
    priority: str = TicketPriority.NORMAL,
    category: str | None = None,
    requester_contact: Contact | None = None,
    assignee_membership: OrganizationMembership | None = None,
    group: EmployeeGroup | None = None,
    origin_conversation: Conversation | None = None,
    actor_membership: OrganizationMembership | None = None,
) -> Ticket:
    """Создание агрегата заявки с первичными связями и событием аудита."""
    if not category:
        settings_obj = HeldeskSettings.objects.filter(organization=organization).first()
        category = settings_obj.default_category if settings_obj else "general"

    with transaction.atomic():
        number = generate_ticket_number(organization)

        ticket = Ticket(
            organization=organization,
            number=number,
            subject=subject.strip(),
            description=description.strip(),
            status=TicketStatus.NEW,
            priority=priority,
            category=category,
            requester_contact=requester_contact,
            assignee_membership=assignee_membership,
            group=group,
            origin_conversation=origin_conversation,
            version=1,
        )
        ticket.full_clean()
        ticket.save()

        if requester_contact is not None:
            TicketContactLink.objects.create(
                organization=organization,
                ticket=ticket,
                contact=requester_contact,
                role="requester",
            )

        if origin_conversation is not None:
            TicketConversationLink.objects.create(
                organization=organization,
                ticket=ticket,
                conversation=origin_conversation,
                origin_channel=origin_conversation.channel,
                link_type="primary",
            )
            event_type = TicketEventType.CREATED_FROM_CONVERSATION
        else:
            event_type = TicketEventType.CREATED

        TicketEvent.objects.create(
            organization=organization,
            ticket=ticket,
            event_type=event_type,
            actor_membership=actor_membership,
            new_values={
                "number": ticket.number,
                "subject": ticket.subject,
                "priority": ticket.priority,
                "category": ticket.category,
                "status": ticket.status,
            },
        )

        return ticket


def create_ticket_from_conversation(
    conversation: Conversation,
    *,
    subject: str,
    description: str = "",
    priority: str = TicketPriority.NORMAL,
    category: str | None = None,
    assignee_membership: OrganizationMembership | None = None,
    group: EmployeeGroup | None = None,
    actor_membership: OrganizationMembership | None = None,
) -> Ticket:
    """Создание заявки напрямую из диалога оперативного чата."""
    return create_ticket(
        organization=conversation.organization,
        subject=subject,
        description=description,
        priority=priority,
        category=category,
        requester_contact=conversation.contact,
        assignee_membership=assignee_membership,
        group=group,
        origin_conversation=conversation,
        actor_membership=actor_membership,
    )
