import { describe, expect, it } from "vitest";
import {
  ALLOWED_TRANSITIONS,
  formatTicketEventDescription,
  getPriorityMeta,
  getStatusMeta,
  requiresTransitionReason,
} from "../model";
import type { TicketPriority, TicketStatus } from "../types";

describe("tickets model and domain helpers", () => {
  it("maps ticket statuses to correct labels and badge statuses", () => {
    const statuses: TicketStatus[] = [
      "NEW",
      "IN_PROGRESS",
      "WAITING_CUSTOMER",
      "RESOLVED",
      "CLOSED",
      "CANCELLED",
      "DUPLICATE",
    ];

    for (const st of statuses) {
      const meta = getStatusMeta(st);
      expect(meta.status).toBe(st);
      expect(meta.label).toBeTruthy();
      expect(["system", "normal", "warning", "success", "alert"]).toContain(meta.badgeStatus);
    }
  });

  it("maps ticket priorities to correct tone and badge statuses", () => {
    const priorities: TicketPriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];

    for (const pr of priorities) {
      const meta = getPriorityMeta(pr);
      expect(meta.priority).toBe(pr);
      expect(meta.label).toBeTruthy();
      expect(["neutral", "normal", "warning", "urgent"]).toContain(meta.tone);
    }
  });

  it("correctly identifies when transition reason is required", () => {
    expect(requiresTransitionReason("RESOLVED")).toBe(true);
    expect(requiresTransitionReason("CLOSED")).toBe(true);
    expect(requiresTransitionReason("CANCELLED")).toBe(true);
    expect(requiresTransitionReason("DUPLICATE")).toBe(true);
    expect(requiresTransitionReason("IN_PROGRESS")).toBe(false);
    expect(requiresTransitionReason("WAITING_CUSTOMER")).toBe(false);
  });

  it("enforces allowed state machine transitions", () => {
    expect(ALLOWED_TRANSITIONS.NEW).toContain("IN_PROGRESS");
    expect(ALLOWED_TRANSITIONS.NEW).not.toContain("CLOSED");
    expect(ALLOWED_TRANSITIONS.IN_PROGRESS).toContain("RESOLVED");
    expect(ALLOWED_TRANSITIONS.IN_PROGRESS).toContain("WAITING_CUSTOMER");
    expect(ALLOWED_TRANSITIONS.CLOSED).toEqual([]);
    expect(ALLOWED_TRANSITIONS.CANCELLED).toEqual([]);
    expect(ALLOWED_TRANSITIONS.DUPLICATE).toEqual([]);
  });

  it("formats audit event descriptions correctly", () => {
    expect(
      formatTicketEventDescription({
        event_type: "CREATED",
        old_values: {},
        new_values: {},
      }),
    ).toBeTruthy();

    const statusEventDesc = formatTicketEventDescription({
      event_type: "STATUS_CHANGED",
      old_values: { status: "NEW" },
      new_values: { status: "IN_PROGRESS" },
    });
    expect(statusEventDesc).toContain("→");

    const assigneeDesc = formatTicketEventDescription({
      event_type: "ASSIGNEE_CHANGED",
      old_values: {},
      new_values: { assignee_name: "Иван Иванов" },
    });
    expect(assigneeDesc).toContain("Иван Иванов");
  });
});
