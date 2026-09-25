import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CreateTicketModal } from "../CreateTicketModal";
import { TicketsTable } from "../TicketsTable";
import { TicketStatusActions } from "../TicketStatusActions";
import type { Ticket } from "../types";

vi.mock("@consta/uikit/Modal", () => ({
  Modal: ({ children, isOpen }: any) => {
    if (!isOpen) return null;
    return <div data-testid="consta-modal">{children}</div>;
  },
}));

vi.mock("@consta/uikit/Card", () => ({
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
}));

const sampleTicket: Ticket = {
  id: 101,
  organization_id: 1,
  number: "TKT-000101",
  subject: "Не загружается отчёт",
  description: "Ошибка 500 при выгрузке",
  status: "NEW",
  priority: "HIGH",
  category: "general",
  requester_contact_id: 5,
  requester_contact: {
    id: 5,
    name: "Анна Смирнова",
  },
  assignee_membership_id: null,
  assignee: null,
  group_id: null,
  group: null,
  origin_conversation_id: null,
  version: 1,
  resolution_reason: "",
  cancellation_reason: "",
  created_at: "2026-09-25T10:00:00Z",
  updated_at: "2026-09-25T10:00:00Z",
  resolved_at: null,
  closed_at: null,
};

describe("Tickets UI Components", () => {
  describe("TicketsTable", () => {
    it("renders ticket table rows with formatted data", () => {
      const onOpen = vi.fn();
      const html = renderToStaticMarkup(
        <TicketsTable tickets={[sampleTicket]} onOpenTicket={onOpen} />,
      );

      expect(html).toContain("TKT-000101");
      expect(html).toContain("Не загружается отчёт");
      expect(html).toContain("Анна Смирнова");
      expect(html).toContain("tickets-table-row");
    });

    it("renders empty state or empty rows when tickets array is empty", () => {
      const html = renderToStaticMarkup(
        <TicketsTable tickets={[]} onOpenTicket={() => undefined} />,
      );

      expect(html).toContain("tickets-table-head");
      expect(html).not.toContain("tickets-table-row");
    });
  });

  describe("TicketStatusActions", () => {
    it("renders actionable transition buttons for NEW ticket", () => {
      const html = renderToStaticMarkup(
        <TicketStatusActions
          ticket={sampleTicket}
          onStatusChanged={() => undefined}
        />,
      );

      // Для статуса NEW разрешены переходы в IN_PROGRESS, CANCELLED, DUPLICATE
      expect(html).toContain("ticket-status-actions");
      expect(html).toContain("В работе");
    });

    it("renders null for terminal status CLOSED", () => {
      const closedTicket: Ticket = {
        ...sampleTicket,
        status: "CLOSED",
      };
      const html = renderToStaticMarkup(
        <TicketStatusActions
          ticket={closedTicket}
          onStatusChanged={() => undefined}
        />,
      );

      expect(html).toBe("");
    });
  });

  describe("CreateTicketModal", () => {
    it("does not render content when open is false", () => {
      const html = renderToStaticMarkup(
        <CreateTicketModal
          open={false}
          onClose={() => undefined}
          onCreated={() => undefined}
        />,
      );

      expect(html).toBe("");
    });

    it("renders form fields and submit button when open is true", () => {
      const html = renderToStaticMarkup(
        <CreateTicketModal
          open={true}
          onClose={() => undefined}
          onCreated={() => undefined}
        />,
      );

      expect(html).toContain("Создать заявку");
      expect(html).toContain("Тема");
      expect(html).toContain("Описание");
      expect(html).toContain("Создать");
    });
  });
});
