import { useState } from "react";
import type { EmployeeGroup } from "../../../types";
import { Button, IconButton } from "../../../shared/ui-controls";
import { SwitchButton } from "../../../shared/form-controls";
import { Icon } from "../../../shared/icons";
import { t } from "../../../i18n";
import {
  actionTargetTitle,
  formatConditionsSummary,
  triggerEventTitle,
} from "./model";
import { deleteRoutingRule, reorderRoutingRules, updateRoutingRule } from "./api";
import type { ChannelRoutingRule } from "./types";
import { RoutingRuleModal } from "./RoutingRuleModal";

type Props = {
  channelId: number;
  rules: ChannelRoutingRule[];
  groups: EmployeeGroup[];
  canManage: boolean;
  onRulesUpdated: (rules: ChannelRoutingRule[]) => void;
};

export function RoutingRulesList({
  channelId,
  rules,
  groups,
  canManage,
  onRulesUpdated,
}: Props) {
  const [editingRule, setEditingRule] = useState<ChannelRoutingRule | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function toggleRuleActive(rule: ChannelRoutingRule) {
    if (!canManage) return;
    setBusyId(rule.id);
    try {
      const updated = await updateRoutingRule(channelId, rule.id, {
        is_active: !rule.is_active,
      });
      onRulesUpdated(rules.map((r) => (r.id === rule.id ? updated : r)));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(ruleId: number) {
    if (!canManage) return;
    setBusyId(ruleId);
    try {
      await deleteRoutingRule(channelId, ruleId);
      onRulesUpdated(rules.filter((r) => r.id !== ruleId));
    } finally {
      setBusyId(null);
    }
  }

  async function movePriority(index: number, direction: "up" | "down") {
    if (!canManage) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= rules.length) return;

    const currentRule = rules[index];
    const nextRules = [...rules];
    [nextRules[index], nextRules[targetIndex]] = [nextRules[targetIndex], nextRules[index]];

    setBusyId(currentRule.id);
    try {
      await reorderRoutingRules(channelId, nextRules.map((rule) => ({ id: rule.id })));
      onRulesUpdated(nextRules.map((rule, ruleIndex) => ({
        ...rule,
        priority: (ruleIndex + 1) * 10,
      })));
    } finally {
      setBusyId(null);
    }
  }

  function handleRuleSaved(saved: ChannelRoutingRule) {
    const exists = rules.some((r) => r.id === saved.id);
    const next = exists
      ? rules.map((r) => (r.id === saved.id ? saved : r))
      : [...rules, saved];
    next.sort((a, b) => a.priority - b.priority);
    onRulesUpdated(next);
  }

  return (
    <div className="routing-rules-container">
      <div className="routing-rules-header">
        <div>
          <h4>{t("routing.rules_list_title")}</h4>
          <p>{t("routing.rules_list_subtitle")}</p>
        </div>
        {canManage && (
          <Button variant="secondary" icon="plus" onClick={() => setIsCreating(true)} data-testid="add-routing-rule-button">
            {t("routing.add_rule")}
          </Button>
        )}
      </div>

      {rules.length === 0 ? (
        <div className="routing-rules-empty">
          <Icon name="gitBranch" size={24} />
          <p>{t("routing.no_rules_configured")}</p>
        </div>
      ) : (
        <div className="routing-rules-list">
          {rules.map((rule, index) => {
            const targetGroupId = rule.target_group_id ?? rule.target_group;
            const groupName = targetGroupId
              ? groups.find((group) => group.id === targetGroupId)?.name
              : undefined;

            return (
              <div
                key={rule.id}
                className={`routing-rule-item ${!rule.is_active ? "is-inactive" : ""}`}
              >
                <div className="routing-rule-priority-col">
                  {canManage && (
                    <div className="routing-rule-reorder">
                      <IconButton
                        icon="chevron"
                        label={t("routing.move_up")}
                        disabled={index === 0 || busyId === rule.id}
                        onClick={() => void movePriority(index, "up")}
                        bare
                        className="routing-reorder-up"
                      />
                      <IconButton
                        icon="chevron"
                        label={t("routing.move_down")}
                        disabled={index === rules.length - 1 || busyId === rule.id}
                        onClick={() => void movePriority(index, "down")}
                        bare
                        className="routing-reorder-down"
                      />
                    </div>
                  )}
                  <span className="routing-priority-badge">#{rule.priority}</span>
                </div>

                <div className="routing-rule-body">
                  <div className="routing-rule-main-line">
                    <strong className="routing-rule-title">{rule.name}</strong>
                    <span className="routing-trigger-tag">
                      {triggerEventTitle(rule.trigger_event)}
                    </span>
                  </div>
                  <div className="routing-rule-conditions-line">
                    {formatConditionsSummary(rule.conditions)}
                  </div>
                  <div className="routing-rule-action-badge">
                    <Icon name="chevronRight" size={12} />
                    <span>{actionTargetTitle(rule.action_target)}</span>
                    {groupName && (
                      <span className="routing-group-tag">({groupName})</span>
                    )}
                  </div>
                </div>

                {canManage && (
                  <div className="routing-rule-actions">
                    <SwitchButton
                      checked={rule.is_active}
                      onClick={() => void toggleRuleActive(rule)}
                      label={t("routing.toggle_active")}
                      className="routing-switch"
                      disabled={busyId === rule.id}
                    />
                    <IconButton
                      icon="edit"
                      label={t("common.edit")}
                      onClick={() => setEditingRule(rule)}
                      bare
                    />
                    <IconButton
                      icon="trash"
                      label={t("common.delete")}
                      onClick={() => void handleDelete(rule.id)}
                      bare
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {(isCreating || editingRule) && (
        <RoutingRuleModal
          channelId={channelId}
          initialRule={editingRule}
          groups={groups}
          onClose={() => {
            setIsCreating(false);
            setEditingRule(null);
          }}
          onSaved={handleRuleSaved}
        />
      )}
    </div>
  );
}
