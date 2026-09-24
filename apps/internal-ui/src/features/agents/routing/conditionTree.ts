import type { MessageKey } from "../../../i18n";
import type {
  ConditionFieldKey,
  ConditionOpKey,
  RuleCondition,
  RuleConditionTree,
} from "./types";
import { isRuleCondition } from "./model";

export const CONDITION_FIELD_OPTIONS: ReadonlyArray<[ConditionFieldKey, MessageKey]> = [
  ["schedule.is_working_hours", "routing.field_working_hours"],
  ["channel.routing_mode", "routing.field_routing_mode"],
  ["message.text_contains", "routing.field_message_contains"],
  ["contact.labels", "routing.field_contact_labels"],
  ["contact.has_phone", "routing.field_has_phone"],
  ["conversation.is_first_message", "routing.field_first_message"],
  ["message.regex_match", "routing.field_regex_match"],
];

export const CONDITION_OPERATOR_OPTIONS: ReadonlyArray<[ConditionOpKey, MessageKey]> = [
  ["eq", "routing.op_equals"],
  ["neq", "routing.op_not_equals"],
  ["contains", "routing.op_contains"],
  ["not_contains", "routing.op_not_contains"],
  ["contains_any", "routing.op_contains_any"],
  ["contains_all", "routing.op_contains_all"],
  ["regex_match", "routing.op_regex_match"],
];

const OPERATORS_BY_FIELD: Record<ConditionFieldKey, readonly ConditionOpKey[]> = {
  "schedule.is_working_hours": ["eq", "neq"],
  "channel.routing_mode": ["eq", "neq"],
  "contact.has_phone": ["eq", "neq"],
  "contact.labels": ["contains", "not_contains", "contains_any", "contains_all"],
  "message.text_contains": ["contains", "not_contains", "contains_any", "contains_all"],
  "message.regex_match": ["regex_match"],
  "conversation.is_first_message": ["eq", "neq"],
};

export function operatorsForField(field: ConditionFieldKey): readonly ConditionOpKey[] {
  return OPERATORS_BY_FIELD[field];
}

export function isBooleanField(field: ConditionFieldKey): boolean {
  return field === "schedule.is_working_hours"
    || field === "contact.has_phone"
    || field === "conversation.is_first_message";
}

export function isTextField(field: ConditionFieldKey): boolean {
  return field === "contact.labels" || field === "message.text_contains";
}

export function isChannelModeField(field: ConditionFieldKey): boolean {
  return field === "channel.routing_mode";
}

export function defaultCondition(): RuleCondition {
  return { field: "schedule.is_working_hours", op: "eq", value: true };
}

export function defaultConditionTree(): RuleConditionTree {
  return { all: [defaultCondition()] };
}

export function conditionForField(
  previous: RuleCondition,
  field: ConditionFieldKey,
): RuleCondition {
  const operators = operatorsForField(field);
  const op = operators.includes(previous.op) ? previous.op : operators[0];
  let value: unknown = previous.value;
  if (isBooleanField(field)) {
    value = typeof previous.value === "boolean" ? previous.value : true;
  } else if (isChannelModeField(field)) {
    value = typeof previous.value === "string" ? previous.value : "AI_FIRST";
  } else if (isTextField(field)) {
    value = Array.isArray(previous.value)
      ? previous.value.join(", ")
      : String(previous.value ?? "");
  } else if (field === "message.regex_match") {
    value = String(previous.value ?? "");
  }
  return { field, op, value };
}

function textValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(", ");
  return String(value ?? "");
}

export function updateConditionValue(
  condition: RuleCondition,
  value: unknown,
): RuleCondition {
  return { ...condition, value };
}

export function serializeConditionTree(tree: RuleConditionTree): RuleConditionTree {
  if (Object.keys(tree).length === 0) return {};
  if (isRuleCondition(tree)) {
    if (isTextField(tree.field) && (tree.op === "contains_any" || tree.op === "contains_all")) {
      const values = Array.isArray(tree.value)
        ? tree.value.map((item) => String(item).trim()).filter(Boolean)
        : textValue(tree.value).split(",").map((item) => item.trim()).filter(Boolean);
      return { ...tree, value: values };
    }
    return tree;
  }
  if ("not" in tree) return { not: serializeConditionTree(tree.not) };
  if ("all" in tree) return { all: tree.all.map(serializeConditionTree) };
  return { any: tree.any.map(serializeConditionTree) };
}
