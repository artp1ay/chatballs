import { beforeAll, describe, expect, it } from "vitest";
import { setPreLoginLanguage } from "../../../i18n";
import {
  actionTargetTitle,
  conditionFieldTitle,
  conditionOperatorTitle,
  formatCondition,
  formatConditionsSummary,
  formatScheduleOverview,
  routingModeDescription,
  routingModeTitle,
  triggerEventTitle,
} from "./model";
import type { ChannelBusinessHours, ChannelRoutingRule } from "./types";
import {
  addDayInterval,
  hasOverlappingIntervals,
  isRoundTheClockSchedule,
  validateWeeklySchedule,
} from "./businessHoursModel";

describe("Routing model and formatting", () => {
  beforeAll(() => {
    setPreLoginLanguage("ru");
  });

  it("formats routing mode titles and descriptions", () => {
    expect(routingModeTitle("AI_FIRST")).toBe("AI по умолчанию");
    expect(routingModeTitle("HUMAN_ONLY")).toBe("Только операторы");
    expect(routingModeTitle("RULE_BASED")).toBe("По правилам (гибридный)");

    expect(routingModeDescription("AI_FIRST")).toContain("Все обращения начинает AI");
    expect(routingModeDescription("HUMAN_ONLY")).toContain("AI отключён");
    expect(routingModeDescription("RULE_BASED")).toContain("Маршрутизация по расписанию");
  });

  it("formats trigger events and action targets", () => {
    expect(triggerEventTitle("CONVERSATION_CREATED")).toBe("Создание диалога");
    expect(triggerEventTitle("MESSAGE_RECEIVED")).toBe("Входящее сообщение");

    expect(actionTargetTitle("ROUTE_TO_AI")).toBe("Направить агенту AI");
    expect(actionTargetTitle("ROUTE_TO_HUMAN")).toBe("Направить в очередь операторов");
    expect(actionTargetTitle("ASSIGN_GROUP")).toBe("Назначить группу операторов");
    expect(actionTargetTitle("DROP_SILENTLY")).toBe("Игнорировать (спам)");
  });

  it("formats condition fields and operators", () => {
    expect(conditionFieldTitle("schedule.is_working_hours")).toBe("Рабочее время по графику");
    expect(conditionFieldTitle("contact.labels")).toBe("Метка клиента");
    expect(conditionFieldTitle("message.text_contains")).toBe("Текст содержит слова");
    expect(conditionFieldTitle("channel.routing_mode")).toBe("Режим маршрутизации канала");

    expect(conditionOperatorTitle("eq")).toBe("равно");
    expect(conditionOperatorTitle("neq")).toBe("не равно");
    expect(conditionOperatorTitle("contains")).toBe("содержит");
    expect(conditionOperatorTitle("not_contains")).toBe("не содержит");
    expect(conditionOperatorTitle("contains_any")).toBe("содержит любое из");
    expect(conditionOperatorTitle("contains_all")).toBe("содержит все");
  });

  it("formats individual conditions correctly", () => {
    expect(
      formatCondition({
        field: "schedule.is_working_hours",
        op: "eq",
        value: true,
      }),
    ).toBe("Рабочее время по графику равно «Да»");

    expect(
      formatCondition({
        field: "contact.labels",
        op: "contains",
        value: "VIP",
      }),
    ).toBe("Метка клиента содержит «VIP»");

    expect(
      formatCondition({
        field: "message.text_contains",
        op: "contains_any",
        value: ["жалоба", "директор"],
      }),
    ).toBe("Текст содержит слова содержит любое из «жалоба, директор»");
  });

  it("formats conditions summary for 'all' logic", () => {
    const summary = formatConditionsSummary({
      all: [
        { field: "schedule.is_working_hours", op: "eq", value: true },
        { field: "contact.labels", op: "contains", value: "VIP" },
      ],
    });
    expect(summary).toBe(
      "Рабочее время по графику равно «Да» И Метка клиента содержит «VIP»",
    );
  });

  it("formats conditions summary for 'any' logic", () => {
    const summary = formatConditionsSummary({
      any: [
        { field: "message.text_contains", op: "contains", value: "возврат" },
        { field: "contact.has_phone", op: "eq", value: false },
      ],
    });
    expect(summary).toBe(
      "Текст содержит слова содержит «возврат» ИЛИ Телефон подтверждён равно «Нет»",
    );
  });

  it("formats a root leaf and a nested not block safely", () => {
    expect(
      formatConditionsSummary({
        field: "channel.routing_mode",
        op: "eq",
        value: "HUMAN_ONLY",
      }),
    ).toBe("Режим маршрутизации канала равно «Только операторы»");

    expect(
      formatConditionsSummary({
        not: {
          field: "contact.labels",
          op: "not_contains",
          value: ["VIP"],
        },
      }),
    ).toBe("НЕ (Метка клиента не содержит «VIP»)");
  });

  it("handles empty conditions gracefully", () => {
    expect(formatConditionsSummary({})).toBe(
      "Всегда срабатывает (без дополнительных условий)",
    );
  });

  it("formats schedule overview", () => {
    expect(formatScheduleOverview(null)).toBe("График не настроен");

    const roundTheClock: ChannelBusinessHours = {
      timezone: "Europe/Moscow",
      weekly_schedule: {},
      holidays: [],
    };
    expect(formatScheduleOverview(roundTheClock)).toBe("Круглосуточно");
    expect(formatScheduleOverview({ timezone: "UTC", weekly_schedule: { mon: [] }, holidays: [] })).toBe("График не настроен");

    const customSchedule: ChannelBusinessHours = {
      timezone: "Europe/Moscow",
      weekly_schedule: {
        mon: [{ start: "09:00", end: "18:00" }],
        tue: [{ start: "09:00", end: "18:00" }],
        wed: [{ start: "09:00", end: "18:00" }],
        thu: [{ start: "09:00", end: "18:00" }],
        fri: [{ start: "09:00", end: "17:00" }],
        sat: [],
        sun: [],
      },
      holidays: ["2026-01-01"],
    };
    expect(formatScheduleOverview(customSchedule)).toBe("5 / 7 дней (Europe/Moscow)");
  });

  it("различает пустой круглосуточный словарь и отсутствие записи", () => {
    expect(isRoundTheClockSchedule({})).toBe(true);
    expect(isRoundTheClockSchedule({ mon: [] })).toBe(false);
    expect(formatScheduleOverview(null)).toBe("График не настроен");
  });

  it("добавляет и проверяет интервалы дня без пересечений", () => {
    const first = addDayInterval({}, "mon");
    expect(first.error).toBeNull();
    expect(first.schedule.mon).toHaveLength(1);

    const second = addDayInterval(first.schedule, "mon");
    expect(second.error).toBeNull();
    expect(second.schedule.mon).toHaveLength(2);
    expect(validateWeeklySchedule(second.schedule)).toBeNull();
    expect(hasOverlappingIntervals([
      { start: "09:00", end: "13:00" },
      { start: "12:00", end: "18:00" },
    ])).toBe(true);
    expect(hasOverlappingIntervals([
      { start: "09:00", end: "13:00" },
      { start: "13:00", end: "18:00" },
    ])).toBe(false);
  });
});
