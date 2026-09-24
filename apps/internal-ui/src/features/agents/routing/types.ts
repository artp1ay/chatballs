// Типы данных модуля гибкой маршрутизации диалогов и правил подключения AI.
// Источник истины для JSON-дерева условий — backend-валидатор channels/rules.

export type ChannelRoutingMode = "AI_FIRST" | "HUMAN_ONLY" | "RULE_BASED";

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type TimeInterval = {
  start: string;
  end: string;
};

export type WeeklySchedule = Partial<Record<DayKey, TimeInterval[]>>;

export type ChannelBusinessHours = {
  timezone: string;
  weekly_schedule: WeeklySchedule;
  holidays: string[];
};

export type RuleTriggerEvent = "CONVERSATION_CREATED" | "MESSAGE_RECEIVED";

export type RuleActionTarget =
  | "ROUTE_TO_AI"
  | "ROUTE_TO_HUMAN"
  | "ASSIGN_GROUP"
  | "DROP_SILENTLY";

export type ConditionFieldKey =
  | "schedule.is_working_hours"
  | "channel.routing_mode"
  | "contact.has_phone"
  | "contact.labels"
  | "message.text_contains"
  | "message.regex_match"
  | "conversation.is_first_message";

/** Операторы, которые backend принимает именно для этих предикатов. */
export type ConditionOpKey =
  | "eq"
  | "neq"
  | "contains"
  | "not_contains"
  | "contains_any"
  | "contains_all"
  | "regex"
  | "regex_match";

export type RuleCondition = {
  field: ConditionFieldKey;
  op: ConditionOpKey;
  value: unknown;
};

export type RuleConditionAll = { all: RuleConditionTree[] };
export type RuleConditionAny = { any: RuleConditionTree[] };
export type RuleConditionNot = { not: RuleConditionTree };
export type EmptyRuleConditionTree = Record<string, never>;

/**
 * Узел дерева правила. Пустой объект — правило без дополнительных условий;
 * группы `all`/`any` содержат списки, а `not` — ровно один вложенный узел.
 */
export type RuleConditionTree =
  | RuleCondition
  | RuleConditionAll
  | RuleConditionAny
  | RuleConditionNot
  | EmptyRuleConditionTree;

export type ChannelRoutingRule = {
  id: number;
  organization?: number;
  channel: number;
  name: string;
  description?: string;
  priority: number;
  is_active: boolean;
  trigger_event: RuleTriggerEvent;
  conditions: RuleConditionTree;
  action_target: RuleActionTarget;
  target_group: number | null;
  target_group_id?: number | null;
  target_group_name?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type RoutingRuleInput = {
  name: string;
  description?: string;
  priority: number;
  is_active: boolean;
  trigger_event: RuleTriggerEvent;
  conditions: RuleConditionTree;
  action_target: RuleActionTarget;
  target_group?: number | null;
  target_group_id?: number | null;
};
