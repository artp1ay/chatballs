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
    case "contains_any":
      return t("routing.op_contains_any");
    case "regex_match":
      return t("routing.op_regex_match");
    default:
      return op;
  }
}

export function formatCondition(condition: RuleCondition): string {
  const fieldName = conditionFieldTitle(condition.field);
  const opName = conditionOperatorTitle(condition.op);
  let valueStr = String(condition.value);

  if (typeof condition.value === "boolean") {
    valueStr = condition.value ? t("common.yes") : t("common.no");
  } else if (Array.isArray(condition.value)) {
    valueStr = condition.value.join(", ");
  }

  return `${fieldName} ${opName} «${valueStr}»`;
}

export function formatConditionsSummary(tree: RuleConditionTree): string {
  const conditions = tree.all ?? tree.any ?? [];
  if (conditions.length === 0) {
    return t("routing.no_conditions_always_matches");
  }
  const isAny = Boolean(tree.any && tree.any.length > 0);
  const connector = isAny ? ` ${t("routing.logic_or")} ` : ` ${t("routing.logic_and")} `;
  return conditions.map(formatCondition).join(connector);
}

export function formatScheduleOverview(hours: ChannelBusinessHours | null): string {
  if (!hours) return t("routing.hours_not_configured");
  const activeDays = (Object.keys(hours.weekly_schedule) as DayKey[]).filter(
    (day) => (hours.weekly_schedule[day]?.length ?? 0) > 0,
  );
  if (activeDays.length === 0) {
    return t("routing.hours_round_the_clock");
  }
  return `${activeDays.length} / 7 дней (${hours.timezone})`;
}
