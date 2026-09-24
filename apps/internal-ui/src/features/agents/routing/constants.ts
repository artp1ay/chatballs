import type { DayKey } from "./types";

export const DAYS_OF_WEEK: Array<{ key: DayKey; translationKey: string }> = [
  { key: "mon", translationKey: "routing.day_mon" },
  { key: "tue", translationKey: "routing.day_tue" },
  { key: "wed", translationKey: "routing.day_wed" },
  { key: "thu", translationKey: "routing.day_thu" },
  { key: "fri", translationKey: "routing.day_fri" },
  { key: "sat", translationKey: "routing.day_sat" },
  { key: "sun", translationKey: "routing.day_sun" },
];

export const POPULAR_TIMEZONES = [
  { value: "Europe/Moscow", label: "Москва (UTC+3)" },
  { value: "Europe/Kaliningrad", label: "Калининград (UTC+2)" },
  { value: "Europe/Samara", label: "Самара (UTC+4)" },
  { value: "Asia/Yekaterinburg", label: "Екатеринбург (UTC+5)" },
  { value: "Asia/Omsk", label: "Омск (UTC+6)" },
  { value: "Asia/Novosibirsk", label: "Новосибирск (UTC+7)" },
  { value: "Asia/Krasnoyarsk", label: "Красноярск (UTC+7)" },
  { value: "Asia/Irkutsk", label: "Иркутск (UTC+8)" },
  { value: "Asia/Yakutsk", label: "Якутск (UTC+9)" },
  { value: "Asia/Vladivostok", label: "Владивосток (UTC+10)" },
  { value: "Asia/Magadan", label: "Магадан (UTC+11)" },
  { value: "Asia/Kamchatka", label: "Камчатка (UTC+12)" },
  { value: "UTC", label: "UTC" },
  { value: "Asia/Almaty", label: "Алматы (UTC+5)" },
  { value: "Asia/Tashkent", label: "Ташкент (UTC+5)" },
  { value: "Europe/Minsk", label: "Минск (UTC+3)" },
  { value: "Asia/Tbilisi", label: "Тбилиси (UTC+4)" },
  { value: "Asia/Yerevan", label: "Ереван (UTC+4)" },
];

export const DEFAULT_WEEKLY_SCHEDULE = {
  mon: [{ start: "09:00", end: "18:00" }],
  tue: [{ start: "09:00", end: "18:00" }],
  wed: [{ start: "09:00", end: "18:00" }],
  thu: [{ start: "09:00", end: "18:00" }],
  fri: [{ start: "09:00", end: "18:00" }],
  sat: [],
  sun: [],
};
