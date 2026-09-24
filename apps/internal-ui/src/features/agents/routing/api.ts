import { api, ApiError } from "../../../api/client";
import type {
  ChannelBusinessHours,
  ChannelRoutingMode,
  ChannelRoutingRule,
  RoutingRuleInput,
} from "./types";

type ChannelRoutingPayload = {
  id?: number;
  routing_mode?: ChannelRoutingMode;
  routingMode?: ChannelRoutingMode;
};

type RoutingRulesResponse = { items?: ChannelRoutingRule[] } | ChannelRoutingRule[];

/**
 * Все tenant-маршруты проходят через общий api-клиент: он добавляет
 * `/organizations/{public_id}` и CSRF/credentials. Здесь оставляем только
 * канонический versioned path — отдельного unscoped fallback в production нет.
 */
async function channelRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  return api<T>(`/api/v1/channels/${path}`, options);
}

export async function fetchChannelRoutingMode(
  channelId: number,
): Promise<ChannelRoutingMode> {
  const data = await channelRequest<ChannelRoutingPayload>(`${channelId}/`);
  const mode = data.routing_mode ?? data.routingMode;
  if (!mode) {
    throw new Error("Routing mode is missing from the channel response");
  }
  return mode;
}

export async function updateChannelRoutingMode(
  channelId: number,
  routingMode: ChannelRoutingMode,
): Promise<ChannelRoutingPayload> {
  return channelRequest<ChannelRoutingPayload>(`${channelId}/`, {
    method: "PATCH",
    body: JSON.stringify({ routing_mode: routingMode }),
  });
}

export async function fetchBusinessHours(
  channelId: number,
): Promise<ChannelBusinessHours | null> {
  try {
    return await channelRequest<ChannelBusinessHours>(`${channelId}/business-hours/`);
  } catch (error) {
    // Отсутствие записи — штатное состояние «расписание не настроено».
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function saveBusinessHours(
  channelId: number,
  payload: ChannelBusinessHours,
): Promise<ChannelBusinessHours> {
  return channelRequest<ChannelBusinessHours>(`${channelId}/business-hours/`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function fetchRoutingRules(
  channelId: number,
): Promise<ChannelRoutingRule[]> {
  const response = await channelRequest<RoutingRulesResponse>(`${channelId}/routing-rules/`);
  if (Array.isArray(response)) return response;
  return response.items ?? [];
}

export async function createRoutingRule(
  channelId: number,
  payload: RoutingRuleInput,
): Promise<ChannelRoutingRule> {
  return channelRequest<ChannelRoutingRule>(`${channelId}/routing-rules/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateRoutingRule(
  channelId: number,
  ruleId: number,
  payload: Partial<RoutingRuleInput>,
): Promise<ChannelRoutingRule> {
  return channelRequest<ChannelRoutingRule>(
    `${channelId}/routing-rules/${ruleId}/`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteRoutingRule(
  channelId: number,
  ruleId: number,
): Promise<void> {
  await channelRequest<void>(`${channelId}/routing-rules/${ruleId}/`, {
    method: "DELETE",
  });
}

export async function reorderRoutingRules(
  channelId: number,
  orderedRules: Array<{ id: number; priority?: number }>,
): Promise<{ updated_count: number }> {
  return channelRequest<{ updated_count: number }>(`${channelId}/routing-rules/reorder/`, {
    method: "POST",
    body: JSON.stringify({ rule_ids: orderedRules.map((rule) => rule.id) }),
  });
}
