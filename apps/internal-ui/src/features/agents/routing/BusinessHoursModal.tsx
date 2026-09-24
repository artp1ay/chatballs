import { Modal } from "antd";
import { useEffect, useState } from "react";
import { DAYS_OF_WEEK, POPULAR_TIMEZONES, DEFAULT_WEEKLY_SCHEDULE } from "./constants";
import { saveBusinessHours } from "./api";
import type { ChannelBusinessHours, DayKey, WeeklySchedule } from "./types";
import { Button, IconButton } from "../../../shared/ui-controls";
import { FormField, SelectField } from "../../../shared/form-controls";
import { Icon } from "../../../shared/icons";
import { type MessageKey, t } from "../../../i18n";

type Props = {
  channelId: number;
  initialHours: ChannelBusinessHours | null;
  onClose: () => void;
  onSaved: (hours: ChannelBusinessHours) => void;
};

export function BusinessHoursModal({ channelId, initialHours, onClose, onSaved }: Props) {
  const [timezone, setTimezone] = useState(initialHours?.timezone ?? "Europe/Moscow");
  const [schedule, setSchedule] = useState<WeeklySchedule>(
    initialHours?.weekly_schedule && Object.keys(initialHours.weekly_schedule).length > 0
      ? initialHours.weekly_schedule
      : DEFAULT_WEEKLY_SCHEDULE,
  );
  const [holidays, setHolidays] = useState<string[]>(initialHours?.holidays ?? []);
  const [newHoliday, setNewHoliday] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleDay(day: DayKey) {
    setSchedule((prev) => {
      const current = prev[day] ?? [];
      if (current.length > 0) {
        return { ...prev, [day]: [] };
      }
      return { ...prev, [day]: [{ start: "09:00", end: "18:00" }] };
    });
  }

  function updateDayTime(day: DayKey, field: "start" | "end", val: string) {
    setSchedule((prev) => {
      const current = prev[day] ?? [{ start: "09:00", end: "18:00" }];
      const updated = { ...current[0], [field]: val };
      return { ...prev, [day]: [updated] };
    });
  }

  function addHoliday() {
    const trimmed = newHoliday.trim();
    if (!trimmed || holidays.includes(trimmed)) return;
    setHolidays([...holidays, trimmed]);
    setNewHoliday("");
  }

  function removeHoliday(date: string) {
    setHolidays(holidays.filter((item) => item !== date));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload: ChannelBusinessHours = {
        timezone,
        weekly_schedule: schedule,
        holidays,
      };
      const result = await saveBusinessHours(channelId, payload);
      onSaved(result);
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
      title={t("routing.business_hours_title")}
      onCancel={onClose}
      footer={null}
      destroyOnClose
      width={620}
    >
      <div className="business-hours-modal">
        <p className="business-hours-lead">{t("routing.business_hours_description")}</p>

        <div className="business-hours-field">
          <SelectField
            label={t("routing.timezone")}
            value={timezone}
            onChange={setTimezone}
            options={POPULAR_TIMEZONES.map((tz) => [tz.value, tz.label])}
          />
        </div>

        <div className="business-hours-schedule">
          <span className="business-hours-section-title">{t("routing.weekly_schedule")}</span>
          <div className="business-hours-days">
            {DAYS_OF_WEEK.map(({ key, translationKey }) => {
              const intervals = schedule[key] ?? [];
              const isWorking = intervals.length > 0;
              const interval = intervals[0] ?? { start: "09:00", end: "18:00" };

              return (
                <div key={key} className={`business-hours-day-row ${isWorking ? "is-active" : ""}`}>
                  <label className="business-hours-day-check">
                    <input
                      type="checkbox"
                      checked={isWorking}
                      onChange={() => toggleDay(key)}
                    />
                    <span className="business-hours-day-name">{t(translationKey as MessageKey)}</span>
                  </label>

                  {isWorking ? (
                    <div className="business-hours-times">
                      <input
                        type="time"
                        className="business-hours-time-input"
                        value={interval.start}
                        onChange={(e) => updateDayTime(key, "start", e.target.value)}
                      />
                      <span className="business-hours-time-separator">—</span>
                      <input
                        type="time"
                        className="business-hours-time-input"
                        value={interval.end}
                        onChange={(e) => updateDayTime(key, "end", e.target.value)}
                      />
                    </div>
                  ) : (
                    <span className="business-hours-day-off">{t("routing.day_off")}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="business-hours-holidays">
          <span className="business-hours-section-title">{t("routing.holidays_title")}</span>
          <div className="business-hours-holidays-input-row">
            <input
              type="date"
              className="business-hours-date-input"
              value={newHoliday}
              onChange={(e) => setNewHoliday(e.target.value)}
            />
            <Button variant="secondary" onClick={addHoliday} icon="plus">
              {t("common.add")}
            </Button>
          </div>
          {holidays.length > 0 && (
            <div className="business-hours-holidays-tags">
              {holidays.map((date) => (
                <span key={date} className="business-hours-holiday-tag">
                  {date}
                  <button
                    type="button"
                    className="business-hours-tag-remove"
                    onClick={() => removeHoliday(date)}
                    aria-label={t("common.remove")}
                  >
                    <Icon name="close" size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {error && <div className="business-hours-error">{error}</div>}

        <div className="business-hours-actions">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={() => void handleSave()} disabled={saving}>
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
