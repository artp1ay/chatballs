import { api } from "../../../api/client";
import type {
  ChannelBusinessHours,
  ChannelRoutingMode,
  ChannelRoutingRule,
  RoutingRuleInput,
} from "./types";

async function channelRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  try {
    return await api<T>(`/api/v1/channels/${path}`, options);
  } catch (caught) {
    // Резервный вызов без префикса версии согласно контракту спецификации ADR
    return await api<T>(`/api/channels/${path}`, options);
  }
}

export async function fetchChannelRoutingMode(
  channelId: number,
): Promise<ChannelRoutingMode> {
  const data = await channelRequest<{ routing_mode?: ChannelRoutingMode; routingMode?: ChannelRoutingMode }>(
    `${channelId}/`,
  );
  return data.routing_mode ?? data.routingMode ?? "AI_FIRST";
}

export async function updateChannelRoutingMode(
  channelId: number,
  routingMode: ChannelRoutingMode,
): Promise<{ routing_mode: ChannelRoutingMode }> {
  return channelRequest<{ routing_mode: ChannelRoutingMode }>(`${channelId}/`, {
    method: "PATCH",
    body: JSON.stringify({ routing_mode: routingMode }),
  });
}

export async function fetchBusinessHours(
  channelId: number,
): Promise<ChannelBusinessHours> {
  return channelRequest<ChannelBusinessHours>(`${channelId}/business-hours/`);
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
  const response = await channelRequest<{ items?: ChannelRoutingRule[] } | ChannelRoutingRule[]>(
    `${channelId}/routing-rules/`,
  );
  if (Array.isArray(response)) {
    return response;
  }
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
  orderedRules: Array<{ id: number; priority: number }>,
): Promise<void> {
  await Promise.all(
    orderedRules.map((rule) =>
      updateRoutingRule(channelId, rule.id, { priority: rule.priority }),
    ),
  );
}
