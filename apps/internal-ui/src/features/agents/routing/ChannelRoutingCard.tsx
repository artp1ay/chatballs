import { useEffect, useState } from "react";
import type { EmployeeGroup } from "../../../types";
import { Button } from "../../../shared/ui-controls";
import { Icon } from "../../../shared/icons";
import { t } from "../../../i18n";
import "./routing.css";
import {
  fetchBusinessHours,
  fetchChannelRoutingMode,
  fetchRoutingRules,
  updateChannelRoutingMode,
} from "./api";
import { BusinessHoursModal } from "./BusinessHoursModal";
import { RoutingRulesList } from "./RoutingRulesList";
import { formatScheduleOverview, routingModeDescription, routingModeTitle } from "./model";
import type {
  ChannelBusinessHours,
  ChannelRoutingMode,
  ChannelRoutingRule,
} from "./types";

const MODES: ChannelRoutingMode[] = ["AI_FIRST", "HUMAN_ONLY", "RULE_BASED"];

type Props = {
  channelId: number;
  groups: EmployeeGroup[];
  canManage: boolean;
};

export function ChannelRoutingCard({ channelId, groups, canManage }: Props) {
  const [mode, setMode] = useState<ChannelRoutingMode>("AI_FIRST");
  const [businessHours, setBusinessHours] = useState<ChannelBusinessHours | null>(null);
  const [rules, setRules] = useState<ChannelRoutingRule[]>([]);
  const [hoursModalOpen, setHoursModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingMode, setSavingMode] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    async function loadData() {
      setLoading(true);
      try {
        const [modeData, hoursData, rulesData] = await Promise.allSettled([
          fetchChannelRoutingMode(channelId),
          fetchBusinessHours(channelId),
          fetchRoutingRules(channelId),
        ]);

        if (!active) return;

        if (modeData.status === "fulfilled") {
          setMode(modeData.value);
        }
        if (hoursData.status === "fulfilled") {
          setBusinessHours(hoursData.value);
        }
        if (rulesData.status === "fulfilled") {
          setRules(rulesData.value.sort((a, b) => a.priority - b.priority));
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadData();
    return () => {
      active = false;
    };
  }, [channelId]);

  async function handleModeChange(nextMode: ChannelRoutingMode) {
    if (!canManage || nextMode === mode || savingMode) return;
    setSavingMode(true);
    setFeedback(null);
    try {
      await updateChannelRoutingMode(channelId, nextMode);
      setMode(nextMode);
      setFeedback({ kind: "success", text: t("routing.mode_saved") });
      window.setTimeout(() => setFeedback(null), 3000);
    } catch (caught) {
      setFeedback({
        kind: "error",
        text: caught instanceof Error ? caught.message : t("common.could_not_save"),
      });
    } finally {
      setSavingMode(false);
    }
  }

  return (
    <section className="agent-card routing-card">
      <div className="agent-card-head is-row">
        <div>
          <h3>{t("routing.card_title")}</h3>
          <small>{t("routing.card_subtitle")}</small>
        </div>
      </div>

      {feedback && (
        <div className={`routing-feedback is-${feedback.kind}`}>{feedback.text}</div>
      )}

      <div className="routing-modes-grid">
        {MODES.map((item) => {
          const selected = mode === item;
          return (
            <button
              key={item}
              type="button"
              disabled={!canManage || savingMode}
              className={`routing-mode-option ${selected ? "is-selected" : ""}`}
              onClick={() => void handleModeChange(item)}
            >
              <div className="routing-mode-option-header">
                <span className="routing-mode-dot" />
                <strong>{routingModeTitle(item)}</strong>
              </div>
              <p>{routingModeDescription(item)}</p>
            </button>
          );
        })}
      </div>

      <div className="routing-schedule-panel">
        <div className="routing-schedule-info">
          <Icon name="clock" size={16} />
          <div>
            <strong>{t("routing.business_hours_panel_title")}</strong>
            <small>{formatScheduleOverview(businessHours)}</small>
          </div>
        </div>
        {canManage && (
          <Button
            variant="secondary"
            onClick={() => setHoursModalOpen(true)}
            icon="settings"
          >
            {t("routing.configure_hours")}
          </Button>
        )}
      </div>

      {mode === "RULE_BASED" && (
        <RoutingRulesList
          channelId={channelId}
          rules={rules}
          groups={groups}
          canManage={canManage}
          onRulesUpdated={setRules}
        />
      )}

      {hoursModalOpen && (
        <BusinessHoursModal
          channelId={channelId}
          initialHours={businessHours}
          onClose={() => setHoursModalOpen(false)}
          onSaved={(savedHours) => setBusinessHours(savedHours)}
        />
      )}
    </section>
  );
}
