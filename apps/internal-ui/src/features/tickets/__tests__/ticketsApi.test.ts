import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, setActiveOrganization } from "../../../api/client";
import {
  buildTicketsQuery,
  createTicket,
  createTicketComment,
  createTicketFromConversation,
  createTicketNote,
  fetchTicket,
  fetchTicketComments,
  fetchTicketEvents,
  fetchTicketNotes,
  fetchTickets,
  transitionTicket,
} from "../api";

const orgPublicId = "test-org-123e4567";
const originalFetch = globalThis.fetch;

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  (globalThis as { document?: { cookie?: string } }).document = { cookie: "" };
  setActiveOrganization(orgPublicId);
});

afterEach(() => {
  setActiveOrganization(null);
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("tickets API client", () => {
  it("builds query strings properly", () => {
    expect(buildTicketsQuery({})).toBe("");
    expect(
      buildTicketsQuery({
        status: "NEW",
        priority: "HIGH",
        group_id: 5,
        search: "test",
        window_size: 25,
      }),
    ).toBe("?status=NEW&priority=HIGH&group_id=5&search=test&window_size=25");
  });

  it("fetches ticket list using organization-scoped URL", async () => {
    const mockPayload = { items: [], total: 0, next_cursor: null, has_more: false };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(mockPayload)) as unknown as typeof fetch;

    const res = await fetchTickets({ status: "NEW" });
    expect(res).toEqual(mockPayload);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `/api/v1/organizations/${orgPublicId}/tickets/?status=NEW`,
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("creates a ticket via POST request", async () => {
    const mockTicket = { id: 42, number: "T-42", subject: "Тест" };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(mockTicket, 201)) as unknown as typeof fetch;

    const res = await createTicket({ subject: "Тест" });
    expect(res).toEqual(mockTicket);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `/api/v1/organizations/${orgPublicId}/tickets/`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ subject: "Тест" }),
      }),
    );
  });

  it("creates a ticket from conversation", async () => {
    const mockTicket = { id: 43, number: "T-43", subject: "Из чата" };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(mockTicket, 201)) as unknown as typeof fetch;

    const res = await createTicketFromConversation(99, { subject: "Из чата" });
    expect(res).toEqual(mockTicket);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `/api/v1/organizations/${orgPublicId}/conversations/99/ticket/`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ subject: "Из чата" }),
      }),
    );
  });

  it("handles 409 Conflict when transition fails due to concurrent modification", async () => {
    const conflictPayload = {
      error: "conflict",
      detail: "Заявка была изменена другим пользователем.",
      current_version: 5,
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(conflictPayload, 409)) as unknown as typeof fetch;

    await expect(
      transitionTicket(42, {
        target_status: "RESOLVED",
        expected_version: 3,
        reason: "Решено",
      }),
    ).rejects.toThrow(ApiError);

    try {
      await transitionTicket(42, {
        target_status: "RESOLVED",
        expected_version: 3,
        reason: "Решено",
      });
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(409);
      expect(apiErr.payload).toEqual(conflictPayload);
    }
  });

  it("loads ticket detail, comments, notes and events", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ id: 1, number: "T-1" }))
      .mockResolvedValueOnce(mockResponse([]))
      .mockResolvedValueOnce(mockResponse([]))
      .mockResolvedValueOnce(mockResponse([])) as unknown as typeof fetch;

    const t = await fetchTicket(1);
    const c = await fetchTicketComments(1);
    const n = await fetchTicketNotes(1);
    const e = await fetchTicketEvents(1);

    expect(t.number).toBe("T-1");
    expect(c).toEqual([]);
    expect(n).toEqual([]);
    expect(e).toEqual([]);
  });

  it("posts comments and notes", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ id: 10, text: "Заметка" }, 201))
      .mockResolvedValueOnce(mockResponse({ id: 11, text: "Коммент", is_public: false }, 201)) as unknown as typeof fetch;

    const note = await createTicketNote(1, "Заметка");
    const comment = await createTicketComment(1, "Коммент", false);

    expect(note.text).toBe("Заметка");
    expect(comment.is_public).toBe(false);
  });
});
