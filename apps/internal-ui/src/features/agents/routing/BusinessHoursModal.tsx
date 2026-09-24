import { useState } from "react";
import { DAYS_OF_WEEK, POPULAR_TIMEZONES, DEFAULT_WEEKLY_SCHEDULE } from "./constants";
import { saveBusinessHours } from "./api";
import {
  addDayInterval,
  cloneWeeklySchedule,
  intervalCount,
  isRoundTheClockSchedule,
  validateWeeklySchedule,
} from "./businessHoursModel";
import type { ChannelBusinessHours, DayKey, TimeInterval, WeeklySchedule } from "./types";
import { Button, IconButton } from "../../../shared/ui-controls";
import { SelectField } from "../../../shared/form-controls";
import { ConstaModal } from "../../../shared/ConstaModal";
import { Icon } from "../../../shared/icons";
import { type MessageKey, t } from "../../../i18n";

type Props = {
  channelId: number;
  initialHours: ChannelBusinessHours | null;
  onClose: () => void;
  onSaved: (hours: ChannelBusinessHours) => void;
};

const DEFAULT_INTERVAL: TimeInterval = { start: "09:00", end: "18:00" };

export function BusinessHoursModal({ channelId, initialHours, onClose, onSaved }: Props) {
  const initialSchedule = initialHours
    ? cloneWeeklySchedule(initialHours.weekly_schedule ?? {})
    : cloneWeeklySchedule(DEFAULT_WEEKLY_SCHEDULE);
  const [timezone, setTimezone] = useState(initialHours?.timezone ?? "Europe/Moscow");
  const [schedule, setSchedule] = useState<WeeklySchedule>(initialSchedule);
  const [roundTheClock, setRoundTheClock] = useState(
    initialHours ? isRoundTheClockSchedule(initialSchedule) : false,
  );
  const [holidays, setHolidays] = useState<string[]>(initialHours?.holidays ?? []);
  const [newHoliday, setNewHoliday] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleDay(day: DayKey) {
    setRoundTheClock(false);
    setSchedule((previous) => {
      const current = previous[day] ?? [];
      if (current.length > 0) return { ...previous, [day]: [] };
      return { ...previous, [day]: [{ ...DEFAULT_INTERVAL }] };
    });
  }

  function updateInterval(day: DayKey, index: number, field: "start" | "end", value: string) {
    setRoundTheClock(false);
    setSchedule((previous) => {
      const current = previous[day] ?? [];
      return {
        ...previous,
        [day]: current.map((interval, intervalIndex) => (
          intervalIndex === index ? { ...interval, [field]: value } : interval
        )),
      };
    });
  }

  function addInterval(day: DayKey) {
    const result = addDayInterval(schedule, day);
    if (result.error) {
      setError(result.error === "day_limit"
        ? t("routing.interval_limit_day")
        : result.error === "week_limit"
          ? t("routing.interval_limit_week")
          : t("routing.invalid_interval"));
      return;
    }
    setError(null);
    setRoundTheClock(false);
    setSchedule(result.schedule);
  }

  function removeInterval(day: DayKey, index: number) {
    setRoundTheClock(false);
    setSchedule((previous) => {
      const current = previous[day] ?? [];
      return { ...previous, [day]: current.filter((_, intervalIndex) => intervalIndex !== index) };
    });
  }

  function toggleRoundTheClock(next: boolean) {
    setRoundTheClock(next);
    setError(null);
    if (!next && isRoundTheClockSchedule(schedule)) {
      setSchedule(cloneWeeklySchedule(DEFAULT_WEEKLY_SCHEDULE));
    }
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
    const validationError = roundTheClock ? null : validateWeeklySchedule(schedule);
    if (validationError) {
      setError(validationError === "day_limit"
        ? t("routing.interval_limit_day")
        : validationError === "week_limit"
          ? t("routing.interval_limit_week")
          : t("routing.invalid_interval"));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload: ChannelBusinessHours = {
        timezone,
        weekly_schedule: roundTheClock ? {} : schedule,
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
    <ConstaModal
      open
      title={t("routing.business_hours_title")}
      onCancel={onClose}
      footer={null}
      destroyOnClose
      width={620}
      className="business-hours-modal-window"
      data-testid="business-hours-modal"
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
          <label className="business-hours-round-clock">
            <input
              type="checkbox"
              checked={roundTheClock}
              data-testid="business-hours-round-clock"
              onChange={(event) => toggleRoundTheClock(event.target.checked)}
            />
            <span>{t("routing.hours_round_the_clock")}</span>
            <small>{t("routing.round_the_clock_hint")}</small>
          </label>
          <div className="business-hours-days">
            {DAYS_OF_WEEK.map(({ key, translationKey }) => {
              const intervals = schedule[key] ?? [];
              const isWorking = intervals.length > 0;
              return (
                <div key={key} className={`business-hours-day-row ${isWorking ? "is-active" : ""}`}>
                  <label className="business-hours-day-check">
                    <input
                      type="checkbox"
                      checked={isWorking}
                      data-testid={`business-hours-day-${key}`}
                      onChange={() => toggleDay(key)}
                    />
                    <span className="business-hours-day-name">{t(translationKey as MessageKey)}</span>
                  </label>

                  {isWorking ? (
                    <div className="business-hours-intervals" data-testid={`business-hours-intervals-${key}`}>
                      {intervals.map((interval, index) => (
                        <div className="business-hours-interval-row" key={`${key}-${index}`}>
                          <input
                            type="time"
                            className="business-hours-time-input"
                            data-testid={`business-hours-${key}-${index}-start`}
                            aria-label={`${t("routing.start_time")} ${index + 1}`}
                            value={interval.start}
                            onChange={(event) => updateInterval(key, index, "start", event.target.value)}
                          />
                          <span className="business-hours-time-separator">—</span>
                          <input
                            type="time"
                            className="business-hours-time-input"
                            data-testid={`business-hours-${key}-${index}-end`}
                            aria-label={`${t("routing.end_time")} ${index + 1}`}
                            value={interval.end}
                            onChange={(event) => updateInterval(key, index, "end", event.target.value)}
                          />
                          <IconButton
                            icon="trash"
                            label={t("routing.remove_interval")}
                            data-testid={`business-hours-remove-${key}-${index}`}
                            onClick={() => removeInterval(key, index)}
                            bare
                          />
                        </div>
                      ))}
                      <Button
                        variant="secondary"
                        icon="plus"
                        onClick={() => addInterval(key)}
                        disabled={intervals.length >= 4 || intervalCount(schedule) >= 28}
                      >
                        {t("routing.add_interval")}
                      </Button>
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
              onChange={(event) => setNewHoliday(event.target.value)}
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

        {error && <div className="business-hours-error" role="alert">{error}</div>}

        <div className="business-hours-actions">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={() => void handleSave()} disabled={saving} data-testid="save-business-hours-button">
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </div>
    </ConstaModal>
  );
}
