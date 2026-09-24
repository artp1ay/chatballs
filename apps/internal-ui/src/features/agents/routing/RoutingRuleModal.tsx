import { Modal } from "antd";
import { useState } from "react";
import type { EmployeeGroup } from "../../../types";
import { Button, IconButton } from "../../../shared/ui-controls";
import { FormField, SelectField } from "../../../shared/form-controls";
import { Icon } from "../../../shared/icons";
import { type MessageKey, t } from "../../../i18n";
import { createRoutingRule, updateRoutingRule } from "./api";
import type {
  ChannelRoutingRule,
  ConditionFieldKey,
  ConditionOpKey,
  RoutingRuleInput,
  RuleActionTarget,
  RuleCondition,
  RuleTriggerEvent,
} from "./types";

type Props = {
  channelId: number;
  initialRule: ChannelRoutingRule | null;
  groups: EmployeeGroup[];
  onClose: () => void;
  onSaved: (rule: ChannelRoutingRule) => void;
};

const FIELD_OPTIONS: Array<[ConditionFieldKey, string]> = [
  ["schedule.is_working_hours", "routing.field_working_hours"],
  ["message.text_contains", "routing.field_message_contains"],
  ["contact.labels", "routing.field_contact_labels"],
  ["contact.has_phone", "routing.field_has_phone"],
  ["conversation.is_first_message", "routing.field_first_message"],
  ["message.regex_match", "routing.field_regex_match"],
];

const OP_OPTIONS: Array<[ConditionOpKey, string]> = [
  ["eq", "routing.op_equals"],
  ["neq", "routing.op_not_equals"],
  ["contains", "routing.op_contains"],
  ["contains_any", "routing.op_contains_any"],
  ["regex_match", "routing.op_regex_match"],
];

const TRIGGER_OPTIONS: Array<[RuleTriggerEvent, string]> = [
  ["CONVERSATION_CREATED", "routing.trigger_conversation_created"],
  ["MESSAGE_RECEIVED", "routing.trigger_message_received"],
];

const ACTION_OPTIONS: Array<[RuleActionTarget, string]> = [
  ["ROUTE_TO_AI", "routing.action_route_to_ai"],
  ["ROUTE_TO_HUMAN", "routing.action_route_to_human"],
  ["ASSIGN_GROUP", "routing.action_assign_group"],
  ["DROP_SILENTLY", "routing.action_drop_silently"],
];

export function RoutingRuleModal({ channelId, initialRule, groups, onClose, onSaved }: Props) {
  const isEdit = initialRule !== null;
  const [name, setName] = useState(initialRule?.name ?? "");
  const [priority, setPriority] = useState(String(initialRule?.priority ?? 10));
  const [triggerEvent, setTriggerEvent] = useState<RuleTriggerEvent>(
    initialRule?.trigger_event ?? "CONVERSATION_CREATED",
  );
  const [logicMode, setLogicMode] = useState<"all" | "any">(
    initialRule?.conditions.any ? "any" : "all",
  );

  const initialConditions: RuleCondition[] =
    initialRule?.conditions.any ?? initialRule?.conditions.all ?? [];

  const [conditions, setConditions] = useState<RuleCondition[]>(
    initialConditions.length > 0
      ? initialConditions
      : [{ field: "schedule.is_working_hours", op: "eq", value: true }],
  );

  const [actionTarget, setActionTarget] = useState<RuleActionTarget>(
    initialRule?.action_target ?? "ROUTE_TO_AI",
  );
  const [targetGroup, setTargetGroup] = useState<string>(
    initialRule?.target_group ? String(initialRule.target_group) : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addCondition() {
    setConditions([
      ...conditions,
      { field: "message.text_contains", op: "contains_any", value: "" },
    ]);
  }

  function removeCondition(index: number) {
    setConditions(conditions.filter((_, i) => i !== index));
  }

  function updateCondition(index: number, patch: Partial<RuleCondition>) {
    setConditions(
      conditions.map((item, i) => {
        if (i !== index) return item;
        const next = { ...item, ...patch };
        if (patch.field === "schedule.is_working_hours" || patch.field === "contact.has_phone" || patch.field === "conversation.is_first_message") {
          if (typeof next.value !== "boolean") next.value = true;
          if (next.op !== "eq" && next.op !== "neq") next.op = "eq";
        }
        return next;
      }),
    );
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setError(t("routing.error_name_required"));
      return;
    }
    setSaving(true);
    setError(null);

    const conditionsPayload = {
      [logicMode]: conditions.map((cond) => {
        if (cond.op === "contains_any" && typeof cond.value === "string") {
          return {
            ...cond,
            value: cond.value.split(",").map((s) => s.trim()).filter(Boolean),
          };
        }
        return cond;
      }),
    };

    const payload: RoutingRuleInput = {
      name: name.trim(),
      priority: Number(priority) || 10,
      is_active: initialRule?.is_active ?? true,
      trigger_event: triggerEvent,
      conditions: conditionsPayload,
      action_target: actionTarget,
      target_group: actionTarget === "ASSIGN_GROUP" && targetGroup ? Number(targetGroup) : null,
    };

    try {
      if (isEdit && initialRule) {
        const saved = await updateRoutingRule(channelId, initialRule.id, payload);
        onSaved(saved);
      } else {
        const saved = await createRoutingRule(channelId, payload);
        onSaved(saved);
      }
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("common.could_not_save"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={isEdit ? t("routing.edit_rule_title") : t("routing.create_rule_title")}
      onCancel={onClose}
      footer={null}
      destroyOnClose
      width={680}
    >
      <div className="routing-rule-modal">
        <FormField
          label={t("routing.rule_name")}
          value={name}
          onChange={setName}
          placeholder={t("routing.rule_name_placeholder")}
        />

        <div className="routing-rule-row-2">
          <SelectField
            label={t("routing.trigger_event")}
            value={triggerEvent}
            onChange={(val) => setTriggerEvent(val as RuleTriggerEvent)}
            options={TRIGGER_OPTIONS.map(([val, trKey]) => [val, t(trKey as MessageKey)])}
          />
          <FormField
            label={t("routing.priority")}
            type="number"
            value={priority}
            onChange={setPriority}
          />
        </div>

        <div className="routing-conditions-builder">
          <div className="routing-conditions-header">
            <span className="routing-section-subtitle">{t("routing.conditions_title")}</span>
            <div className="routing-logic-toggle">
              <button
                type="button"
                className={`routing-logic-btn ${logicMode === "all" ? "is-active" : ""}`}
                onClick={() => setLogicMode("all")}
              >
                {t("routing.logic_all")}
              </button>
              <button
                type="button"
                className={`routing-logic-btn ${logicMode === "any" ? "is-active" : ""}`}
                onClick={() => setLogicMode("any")}
              >
                {t("routing.logic_any")}
              </button>
            </div>
          </div>

          <div className="routing-conditions-list">
            {conditions.map((cond, idx) => {
              const isBoolean =
                cond.field === "schedule.is_working_hours" ||
                cond.field === "contact.has_phone" ||
                cond.field === "conversation.is_first_message";

              return (
                <div key={idx} className="routing-condition-row">
                  <select
                    className="routing-select"
                    value={cond.field}
                    onChange={(e) => updateCondition(idx, { field: e.target.value })}
                  >
                    {FIELD_OPTIONS.map(([val, trKey]) => (
                      <option key={val} value={val}>{t(trKey as MessageKey)}</option>
                    ))}
                  </select>

                  <select
                    className="routing-select routing-select-op"
                    value={cond.op}
                    onChange={(e) => updateCondition(idx, { op: e.target.value })}
                  >
                    {OP_OPTIONS.map(([val, trKey]) => (
                      <option key={val} value={val}>{t(trKey as MessageKey)}</option>
                    ))}
                  </select>

                  {isBoolean ? (
                    <select
                      className="routing-select routing-select-val"
                      value={cond.value ? "true" : "false"}
                      onChange={(e) => updateCondition(idx, { value: e.target.value === "true" })}
                    >
                      <option value="true">{t("common.yes")}</option>
                      <option value="false">{t("common.no")}</option>
                    </select>
                  ) : (
                    <input
                      className="routing-input-val"
                      value={Array.isArray(cond.value) ? cond.value.join(", ") : String(cond.value ?? "")}
                      placeholder={cond.op === "contains_any" ? t("routing.comma_separated_phrases") : t("routing.value")}
                      onChange={(e) => updateCondition(idx, { value: e.target.value })}
                    />
                  )}

                  <IconButton
                    icon="trash"
                    label={t("common.remove")}
                    onClick={() => removeCondition(idx)}
                    bare
                  />
                </div>
              );
            })}
          </div>

          <Button variant="secondary" icon="plus" onClick={addCondition}>
            {t("routing.add_condition")}
          </Button>
        </div>

        <div className="routing-action-section">
          <span className="routing-section-subtitle">{t("routing.action_title")}</span>
          <div className="routing-rule-row-2">
            <SelectField
              label={t("routing.action_target")}
              value={actionTarget}
              onChange={(val) => setActionTarget(val as RuleActionTarget)}
              options={ACTION_OPTIONS.map(([val, trKey]) => [val, t(trKey as MessageKey)])}
            />
            {actionTarget === "ASSIGN_GROUP" && (
              <SelectField
                label={t("routing.target_group")}
                value={targetGroup}
                onChange={setTargetGroup}
                options={groups.map((g) => [String(g.id), g.name])}
              />
            )}
          </div>
        </div>

        {error && <div className="routing-modal-error">{error}</div>}

        <div className="routing-modal-actions">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
