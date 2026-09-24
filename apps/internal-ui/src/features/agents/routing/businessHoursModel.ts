import type { DayKey, TimeInterval, WeeklySchedule } from "./types";

export const MAX_INTERVALS_PER_DAY = 4;
export const MAX_INTERVALS_PER_WEEK = 28;

export function cloneWeeklySchedule(schedule: WeeklySchedule): WeeklySchedule {
  return Object.fromEntries(
    Object.entries(schedule).map(([day, intervals]) => [day, intervals.map((interval) => ({ ...interval }))]),
  ) as WeeklySchedule;
}

export function intervalCount(schedule: WeeklySchedule): number {
  return Object.values(schedule).reduce((total, intervals) => total + (intervals?.length ?? 0), 0);
}

export function isRoundTheClockSchedule(schedule: WeeklySchedule): boolean {
  return Object.keys(schedule).length === 0;
}

function minutes(value: string): number | null {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, mins] = value.split(":").map(Number);
  return hours * 60 + mins;
}

function segments(interval: TimeInterval): Array<[number, number]> | null {
  const start = minutes(interval.start);
  const end = minutes(interval.end);
  if (start === null || end === null || start === end) return null;
  if (start < end) return [[start, end]];
  return [[start, 1440], [0, end]];
}

export function hasOverlappingIntervals(intervals: TimeInterval[]): boolean {
  const intervalSegments = intervals.map((interval) => segments(interval));
  if (intervalSegments.some((item) => item === null)) return true;
  const normalized = intervalSegments.flatMap((item) => item ?? []);
  normalized.sort((left, right) => left[0] - right[0]);
  return normalized.some((left, index) => {
    const right = normalized[index + 1];
    return right ? left[1] > right[0] : false;
  });
}

export type ScheduleValidationError = "day_limit" | "week_limit" | "invalid_interval";

export function validateWeeklySchedule(schedule: WeeklySchedule): ScheduleValidationError | null {
  let total = 0;
  for (const intervals of Object.values(schedule)) {
    if (!Array.isArray(intervals) || intervals.length > MAX_INTERVALS_PER_DAY) return "day_limit";
    total += intervals.length;
    if (hasOverlappingIntervals(intervals)) return "invalid_interval";
  }
  if (total > MAX_INTERVALS_PER_WEEK) return "week_limit";
  return null;
}

function formatMinutes(value: number): string {
  const safe = Math.max(0, Math.min(1439, value));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function candidateIntervals(existing: TimeInterval[]): TimeInterval[] {
  const candidates: TimeInterval[] = [
    { start: "09:00", end: "12:00" },
    { start: "12:00", end: "15:00" },
    { start: "15:00", end: "18:00" },
    { start: "18:00", end: "21:00" },
  ];
  const free = candidates.find((candidate) => !hasOverlappingIntervals([...existing, candidate]));
  if (free) return [free];
  const last = existing[existing.length - 1];
  const start = minutes(last?.end ?? "09:00") ?? 9 * 60;
  return [{ start: formatMinutes(start), end: formatMinutes(start + 60) }];
}

export function addDayInterval(
  schedule: WeeklySchedule,
  day: DayKey,
): { schedule: WeeklySchedule; error: ScheduleValidationError | null } {
  const current = schedule[day] ?? [];
  if (current.length >= MAX_INTERVALS_PER_DAY) return { schedule, error: "day_limit" };
  if (intervalCount(schedule) >= MAX_INTERVALS_PER_WEEK) return { schedule, error: "week_limit" };
  const [interval] = candidateIntervals(current);
  return {
    schedule: { ...schedule, [day]: [...current, interval] },
    error: validateWeeklySchedule({ ...schedule, [day]: [...current, interval] }),
  };
}
