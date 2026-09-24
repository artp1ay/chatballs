import type { SnackBarItemDefault, SnackBarItemStatus } from "@consta/uikit/SnackBar";
import { createElement, useCallback, useEffect, useRef, useState } from "react";

import { fetchPreference, type AppNotification, type NotificationLevel, type NotificationPreference } from "./model";
import { showBrowserNotification } from "./browserNotifications";

// Оклик о новом уведомлении: тост внутри вкладки и системное уведомление, если
// человек смотрит в другое место.
//
// Раньше тост показывался по росту счётчика непрочитанных. Счётчик — плохой
// признак события: три уведомления между опросами давали один тост, а
// прочтение в соседней вкладке роняло счётчик и глушило следующий. Считаем по
// идентификаторам: что человеку ещё не показывали, то и показываем.

const NOTIFICATION_SNACK_BAR_STATUS: Record<NotificationLevel, SnackBarItemStatus> = {
  INFO: "normal",
  SUCCESS: "success",
  WARNING: "warning",
  CRITICAL: "alert",
};

/** Преобразует уведомление приложения в элемент глобального SnackBar. */
export function notificationSnackBarItem(notification: AppNotification): SnackBarItemDefault {
  const message = notification.body
    ? createElement(
      "span",
      { className: "notification-snack-message" },
      createElement("strong", null, notification.title),
      createElement("span", null, notification.body),
    )
    : notification.title;

  return {
    key: `notification-${notification.id}`,
    message,
    status: NOTIFICATION_SNACK_BAR_STATUS[notification.level] ?? "normal",
    autoClose: 5000,
  };
}

export function useNotificationAlerts({
  items,
  onAlert,
  onOpen,
}: {
  items: AppNotification[];
  onAlert?: (item: SnackBarItemDefault) => void;
  onOpen: (notification: AppNotification) => void;
}) {
  const [preference, setPreference] = useState<NotificationPreference | null>(null);
  const shown = useRef<Set<number> | null>(null);
  const onOpenRef = useRef(onOpen);
  const onAlertRef = useRef<(item: SnackBarItemDefault) => void>(onAlert ?? (() => undefined));
  onOpenRef.current = onOpen;
  onAlertRef.current = onAlert ?? (() => undefined);
  const preferenceRef = useRef(preference);
  preferenceRef.current = preference;

  const reloadPreference = useCallback(async () => {
    try {
      setPreference(await fetchPreference("BROWSER"));
    } catch {
      /* без настройки системных уведомлений просто не будет */
    }
  }, []);

  useEffect(() => {
    void reloadPreference();
  }, [reloadPreference]);

  useEffect(() => {
    // Первая загрузка только запоминает: накопленное за ночь не вываливают
    // стопкой тостов в лицо тому, кто открыл приложение утром.
    if (shown.current === null) {
      shown.current = new Set(items.map((item) => item.id));
      return;
    }
    const seen = shown.current;
    const fresh = items.filter((item) => item.unread && !seen.has(item.id));
    for (const item of items) seen.add(item.id);
    if (fresh.length === 0) return;

    const newest = fresh[0];
    onAlertRef.current(notificationSnackBarItem(newest));

    const allowed = preferenceRef.current;
    if (!allowed?.enabled) return;
    for (const item of fresh) {
      if (!allowed.types?.includes(item.type)) continue;
      showBrowserNotification(item, (opened) => onOpenRef.current(opened));
    }
  }, [items]);

  return { preference, reloadPreference };
}
