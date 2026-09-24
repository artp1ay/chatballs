import { useState } from "react";
import type { EmployeeGroup } from "../../../types";
import { Button } from "../../../shared/ui-controls";
import { ConstaModal } from "../../../shared/ConstaModal";
import { FormField, SelectField } from "../../../shared/form-controls";
import { type MessageKey, t } from "../../../i18n";
import { createRoutingRule, updateRoutingRule } from "./api";
import { ConditionEditor } from "./ConditionEditor";
import { defaultConditionTree, serializeConditionTree } from "./conditionTree";
import { cloneConditionTree } from "./model";
import type {
  ChannelRoutingRule,
  RoutingRuleInput,
  RuleActionTarget,
  RuleTriggerEvent,
} from "./types";

type Props = {
  channelId: number;
  initialRule: ChannelRoutingRule | null;
  groups: EmployeeGroup[];
  onClose: () => void;
  onSaved: (rule: ChannelRoutingRule) => void;
};

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
  const [conditions, setConditions] = useState(
    initialRule ? cloneConditionTree(initialRule.conditions) : defaultConditionTree(),
  );
  const [actionTarget, setActionTarget] = useState<RuleActionTarget>(
    initialRule?.action_target ?? "ROUTE_TO_AI",
  );
  const [targetGroup, setTargetGroup] = useState<string>(
    String(initialRule?.target_group_id ?? initialRule?.target_group ?? ""),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const trimmedName = name.trim();
    const parsedPriority = Number(priority);
    if (!trimmedName) {
      setError(t("routing.error_name_required"));
      return;
    }
    if (!Number.isInteger(parsedPriority) || parsedPriority < 1 || parsedPriority > 1000) {
      setError(t("routing.error_priority_range"));
      return;
    }
    if (actionTarget === "ASSIGN_GROUP" && !targetGroup) {
      setError(t("routing.error_target_group"));
      return;
    }

    setSaving(true);
    setError(null);
    const payload: RoutingRuleInput = {
      name: trimmedName,
      priority: parsedPriority,
      is_active: initialRule?.is_active ?? true,
      trigger_event: triggerEvent,
      conditions: serializeConditionTree(conditions),
      action_target: actionTarget,
      target_group_id: actionTarget === "ASSIGN_GROUP" ? Number(targetGroup) : null,
    };

    try {
      const saved = isEdit && initialRule
        ? await updateRoutingRule(channelId, initialRule.id, payload)
        : await createRoutingRule(channelId, payload);
      onSaved(saved);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("common.could_not_save"));
    } finally {
      setSaving(false);
    }
  }

  return (
      <ConstaModal
        open
        title={isEdit ? t("routing.edit_rule_title") : t("routing.create_rule_title")}
        onCancel={onClose}
        footer={null}
        destroyOnClose
        width={680}
        className="rule-editor-modal-window"
        data-testid="rule-editor-modal"
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
              onChange={(value) => setTriggerEvent(value as RuleTriggerEvent)}
              options={TRIGGER_OPTIONS.map(([value, key]) => [value, t(key as MessageKey)])}
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
            </div>
            <ConditionEditor value={conditions} onChange={setConditions} />
          </div>

          <div className="routing-action-section">
            <span className="routing-section-subtitle">{t("routing.action_title")}</span>
            <div className="routing-rule-row-2">
              <SelectField
                label={t("routing.action_target")}
                value={actionTarget}
                onChange={(value) => setActionTarget(value as RuleActionTarget)}
                options={ACTION_OPTIONS.map(([value, key]) => [value, t(key as MessageKey)])}
              />
              {actionTarget === "ASSIGN_GROUP" && (
                <SelectField
                  label={t("routing.target_group")}
                  value={targetGroup}
                  onChange={setTargetGroup}
                  options={groups.map((group) => [String(group.id), group.name])}
                />
              )}
            </div>
          </div>

          {error && <div className="routing-modal-error" role="alert">{error}</div>}

          <div className="routing-modal-actions">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleSubmit()}
              disabled={saving}
              data-testid="save-rule-button"
            >
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </div>
      </ConstaModal>
  );
}
