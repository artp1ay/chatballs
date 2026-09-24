"""Тесты машины состояний заявок: переходы, инварианты и optimistic locking."""

from django.test import TestCase

from chatballs.identity.bootstrap import bootstrap_owner
from chatballs.identity.models import Organization, OrganizationMembership
from chatballs.tickets.models import Ticket, TicketEvent, TicketEventType, TicketStatus
from chatballs.tickets.services import create_ticket
from chatballs.tickets.state_machine import (
    TransitionError,
    VersionConflictError,
    execute_transition,
    validate_transition,
)


class StateMachineTests(TestCase):
    def setUp(self) -> None:
        bootstrap_owner(email="sm-owner@example.com", password="temporary-password")
        self.org = Organization.objects.get(slug="demo")
        self.membership = OrganizationMembership.objects.filter(organization=self.org).first()
        self.ticket = create_ticket(
            organization=self.org,
            subject="Настройка SSO",
            actor_membership=self.membership,
        )

    def test_valid_lifecycle_transitions(self) -> None:
        # NEW -> IN_PROGRESS
        t1 = execute_transition(
            self.ticket,
            TicketStatus.IN_PROGRESS,
            actor_membership=self.membership,
            expected_version=1,
        )
        self.assertEqual(t1.status, TicketStatus.IN_PROGRESS)
        self.assertEqual(t1.version, 2)

        # IN_PROGRESS -> WAITING_CUSTOMER
        t2 = execute_transition(
            t1,
            TicketStatus.WAITING_CUSTOMER,
            actor_membership=self.membership,
            expected_version=2,
        )
        self.assertEqual(t2.status, TicketStatus.WAITING_CUSTOMER)
        self.assertEqual(t2.version, 3)

        # WAITING_CUSTOMER -> IN_PROGRESS
        t3 = execute_transition(
            t2,
            TicketStatus.IN_PROGRESS,
            actor_membership=self.membership,
            expected_version=3,
        )
        self.assertEqual(t3.status, TicketStatus.IN_PROGRESS)
        self.assertEqual(t3.version, 4)

        # IN_PROGRESS -> RESOLVED
        t4 = execute_transition(
            t3,
            TicketStatus.RESOLVED,
            actor_membership=self.membership,
            reason="SSO настроен и протестирован",
            expected_version=4,
        )
        self.assertEqual(t4.status, TicketStatus.RESOLVED)
        self.assertIsNotNone(t4.resolved_at)
        self.assertEqual(t4.resolution_reason, "SSO настроен и протестирован")
        self.assertEqual(t4.version, 5)

        # RESOLVED -> CLOSED
        t5 = execute_transition(
            t4,
            TicketStatus.CLOSED,
            actor_membership=self.membership,
            expected_version=5,
        )
        self.assertEqual(t5.status, TicketStatus.CLOSED)
        self.assertIsNotNone(t5.closed_at)
        self.assertEqual(t5.version, 6)

    def test_reopen_from_resolved_resets_resolved_at(self) -> None:
        t_prog = execute_transition(self.ticket, TicketStatus.IN_PROGRESS)
        t_res = execute_transition(
            t_prog,
            TicketStatus.RESOLVED,
            reason="Решено",
        )
        self.assertIsNotNone(t_res.resolved_at)

        t_reopened = execute_transition(t_res, TicketStatus.IN_PROGRESS)
        self.assertIsNone(t_reopened.resolved_at)
        self.assertEqual(t_reopened.resolution_reason, "")

    def test_invalid_transition_raises_error(self) -> None:
        # Из NEW напрямую в CLOSED нельзя
        with self.assertRaises(TransitionError):
            validate_transition(self.ticket, TicketStatus.CLOSED)

        with self.assertRaises(TransitionError):
            execute_transition(self.ticket, TicketStatus.CLOSED)

    def test_terminal_states_cannot_transition(self) -> None:
        t_cancelled = execute_transition(
            self.ticket,
            TicketStatus.CANCELLED,
            reason="Дублирующий запрос",
        )
        self.assertEqual(t_cancelled.status, TicketStatus.CANCELLED)
        self.assertIsNotNone(t_cancelled.closed_at)

        with self.assertRaises(TransitionError):
            execute_transition(t_cancelled, TicketStatus.IN_PROGRESS)

    def test_reason_required_for_cancelled_and_duplicate(self) -> None:
        with self.assertRaises(TransitionError):
            execute_transition(self.ticket, TicketStatus.CANCELLED, reason="")

        with self.assertRaises(TransitionError):
            execute_transition(self.ticket, TicketStatus.DUPLICATE, reason="   ")

    def test_version_conflict_concurrency(self) -> None:
        self.assertEqual(self.ticket.version, 1)

        # Попытка перехода с устаревшей версией
        with self.assertRaises(VersionConflictError) as ctx:
            execute_transition(
                self.ticket,
                TicketStatus.IN_PROGRESS,
                expected_version=99,
            )
        self.assertEqual(ctx.exception.current_version, 1)

    def test_event_logged_on_transition(self) -> None:
        execute_transition(
            self.ticket,
            TicketStatus.IN_PROGRESS,
            actor_membership=self.membership,
        )
        event = TicketEvent.objects.filter(
            ticket=self.ticket,
            event_type=TicketEventType.STATUS_CHANGED,
        ).first()
        self.assertIsNotNone(event)
        self.assertEqual(event.old_values["status"], TicketStatus.NEW)
        self.assertEqual(event.new_values["status"], TicketStatus.IN_PROGRESS)
        self.assertEqual(event.actor_membership, self.membership)
