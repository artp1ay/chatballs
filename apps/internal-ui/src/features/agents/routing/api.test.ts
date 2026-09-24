import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setActiveOrganization } from "../../../api/client";
import {
  fetchBusinessHours,
  fetchChannelRoutingMode,
  fetchRoutingRules,
  reorderRoutingRules,
  updateChannelRoutingMode,
} from "./api";

const organizationPublicId = "123e4567-e89b-12d3-a456-426614174000";
const originalFetch = globalThis.fetch;

beforeEach(() => {
  (globalThis as { document?: { cookie?: string } }).document = { cookie: "" };
});

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  setActiveOrganization(null);
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("organization-scoped routing API", () => {
  it("uses the canonical versioned channel URL and preserves mode response", async () => {
    setActiveOrganization(organizationPublicId);
    globalThis.fetch = vi.fn().mockResolvedValue(response({
      id: 17,
      routing_mode: "RULE_BASED",
      routingMode: "RULE_BASED",
    })) as unknown as typeof fetch;

    await expect(fetchChannelRoutingMode(17)).resolves.toBe("RULE_BASED");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `/api/v1/organizations/${organizationPublicId}/channels/17/`,
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("does not retry a failed canonical request through an unscoped URL", async () => {
    setActiveOrganization(organizationPublicId);
    const fetchMock = vi.fn().mockResolvedValue(response({ detail: "Ошибка" }, 400));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(updateChannelRoutingMode(17, "HUMAN_ONLY")).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/v1/organizations/${organizationPublicId}/channels/17/`,
    );
  });

  it("maps a missing schedule record to null and accepts the items response", async () => {
    setActiveOrganization(organizationPublicId);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ detail: "Расписание канала не настроено" }, 404))
      .mockResolvedValueOnce(response({ items: [{ id: 1 }] }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchBusinessHours(17)).resolves.toBeNull();
    await expect(fetchRoutingRules(17)).resolves.toEqual([{ id: 1 }]);
  });

  it("sends the complete rule id list to the atomic reorder endpoint", async () => {
    setActiveOrganization(organizationPublicId);
    globalThis.fetch = vi.fn().mockResolvedValue(response({ updated_count: 2 })) as unknown as typeof fetch;

    await expect(reorderRoutingRules(17, [{ id: 9 }, { id: 4 }])).resolves.toEqual({ updated_count: 2 });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `/api/v1/organizations/${organizationPublicId}/channels/17/routing-rules/reorder/`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ rule_ids: [9, 4] }),
      }),
    );
  });
});
