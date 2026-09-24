import { t } from "../../../i18n";
import type {
  ChannelBusinessHours,
  ChannelRoutingMode,
  DayKey,
  RuleActionTarget,
  RuleCondition,
  RuleConditionTree,
  RuleTriggerEvent,
} from "./types";

export function routingModeTitle(mode: ChannelRoutingMode): string {
  switch (mode) {
    case "AI_FIRST":
      return t("routing.mode_ai_first");
    case "HUMAN_ONLY":
      return t("routing.mode_human_only");
    case "RULE_BASED":
      return t("routing.mode_rule_based");
    default:
      return mode;
  }
}

export function routingModeDescription(mode: ChannelRoutingMode): string {
  switch (mode) {
    case "AI_FIRST":
      return t("routing.mode_ai_first_desc");
    case "HUMAN_ONLY":
      return t("routing.mode_human_only_desc");
    case "RULE_BASED":
      return t("routing.mode_rule_based_desc");
    default:
      return "";
  }
}

export function triggerEventTitle(event: RuleTriggerEvent): string {
  switch (event) {
    case "CONVERSATION_CREATED":
      return t("routing.trigger_conversation_created");
    case "MESSAGE_RECEIVED":
      return t("routing.trigger_message_received");
    default:
      return event;
  }
}

export function actionTargetTitle(action: RuleActionTarget): string {
  switch (action) {
    case "ROUTE_TO_AI":
      return t("routing.action_route_to_ai");
    case "ROUTE_TO_HUMAN":
      return t("routing.action_route_to_human");
    case "ASSIGN_GROUP":
      return t("routing.action_assign_group");
    case "DROP_SILENTLY":
      return t("routing.action_drop_silently");
    default:
      return action;
  }
}

export function conditionFieldTitle(field: string): string {
  switch (field) {
    case "schedule.is_working_hours":
      return t("routing.field_working_hours");
    case "channel.routing_mode":
      return t("routing.field_routing_mode");
    case "contact.labels":
      return t("routing.field_contact_labels");
    case "contact.has_phone":
      return t("routing.field_has_phone");
    case "message.text_contains":
      return t("routing.field_message_contains");
    case "message.regex_match":
      return t("routing.field_regex_match");
    case "conversation.is_first_message":
      return t("routing.field_first_message");
    default:
      return field;
  }
}

export function conditionOperatorTitle(op: string): string {
  switch (op) {
    case "eq":
      return t("routing.op_equals");
    case "neq":
      return t("routing.op_not_equals");
    case "contains":
      return t("routing.op_contains");
    case "not_contains":
      return t("routing.op_not_contains");
    case "contains_any":
      return t("routing.op_contains_any");
    case "contains_all":
      return t("routing.op_contains_all");
    case "regex_match":
      return t("routing.op_regex_match");
    default:
      return op;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isRuleCondition(value: RuleConditionTree): value is RuleCondition {
  return isRecord(value) && "field" in value && "op" in value && "value" in value;
}

export function isEmptyConditionTree(value: RuleConditionTree): boolean {
  return isRecord(value) && Object.keys(value).length === 0;
}

function formatConditionValue(value: unknown): string {
  if (typeof value === "boolean") {
    return value ? t("common.yes") : t("common.no");
  }
  if (Array.isArray(value)) {
    return value.map((item) => formatConditionValue(item)).join(", ");
  }
  if (value === null || value === undefined) {
    return "—";
  }
  if (isRecord(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return "—";
    }
  }
  return String(value);
}

export function formatCondition(condition: RuleCondition): string {
  const fieldName = conditionFieldTitle(condition.field);
  const opName = conditionOperatorTitle(condition.op);
  const value = condition.field === "channel.routing_mode" && typeof condition.value === "string"
    ? routingModeTitle(condition.value as ChannelRoutingMode)
    : formatConditionValue(condition.value);
  return `${fieldName} ${opName} «${value}»`;
}

function formatTreeNode(tree: RuleConditionTree, nested: boolean): string {
  if (!isRecord(tree)) return t("routing.no_conditions_always_matches");
  if (isEmptyConditionTree(tree)) {
    return t("routing.no_conditions_always_matches");
  }
  if (isRuleCondition(tree)) {
    return formatCondition(tree);
  }
  if ("not" in tree) {
    const inner = formatTreeNode(tree.not, true);
    return `${t("routing.logic_not")} (${inner})`;
  }

  const children = "all" in tree ? tree.all : "any" in tree ? tree.any : null;
  if (!children) return t("routing.no_conditions_always_matches");
  const isAny = "any" in tree;
  if (children.length === 0) {
    return t("routing.no_conditions_always_matches");
  }
  const connector = isAny ? ` ${t("routing.logic_or")} ` : ` ${t("routing.logic_and")} `;
  const summary = children.map((child) => formatTreeNode(child, true)).join(connector);
  return nested ? `(${summary})` : summary;
}

export function formatConditionsSummary(tree: RuleConditionTree): string {
  return formatTreeNode(tree, false);
}

export function cloneConditionTree(tree: RuleConditionTree): RuleConditionTree {
  if (!isRecord(tree) || isEmptyConditionTree(tree)) return {};
  if (isRuleCondition(tree)) {
    return { ...tree, value: Array.isArray(tree.value) ? [...tree.value] : tree.value };
  }
  if ("not" in tree) {
    return { not: cloneConditionTree(tree.not) };
  }
  if ("all" in tree) {
    return { all: tree.all.map(cloneConditionTree) };
  }
  if ("any" in tree) {
    return { any: tree.any.map(cloneConditionTree) };
  }
  return {};
}

export function formatScheduleOverview(hours: ChannelBusinessHours | null): string {
  if (!hours) return t("routing.hours_not_configured");
  const schedule = hours.weekly_schedule ?? {};
  if (Object.keys(schedule).length === 0) {
    return t("routing.hours_round_the_clock");
  }
  const activeDays = (Object.keys(schedule) as DayKey[]).filter(
    (day) => (schedule[day]?.length ?? 0) > 0,
  );
  if (activeDays.length === 0) {
    return t("routing.hours_not_configured");
  }
  return `${activeDays.length} / 7 дней (${hours.timezone})`;
}
