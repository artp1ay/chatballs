import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { notificationSnackBarItem } from "./useNotificationAlerts";
import type { AppNotification, NotificationLevel } from "./model";

function notification(level: NotificationLevel): AppNotification {
  return {
    id: 42,
    type: "conversation",
    level,
    title: "Новое сообщение",
    body: "Текст сообщения",
    targetRoute: "chat",
    targetId: "7",
    createdAt: "2026-09-24T12:00:00Z",
    unread: true,
  };
}

describe("notificationSnackBarItem", () => {
  it("передаёт уровни уведомлений в статусы SnackBar", () => {
    expect(notificationSnackBarItem(notification("INFO")).status).toBe("normal");
    expect(notificationSnackBarItem(notification("SUCCESS")).status).toBe("success");
    expect(notificationSnackBarItem(notification("WARNING")).status).toBe("warning");
    expect(notificationSnackBarItem(notification("CRITICAL")).status).toBe("alert");
  });

  it("сохраняет заголовок и текст в одном сообщении", () => {
    const item = notificationSnackBarItem(notification("INFO"));
    const markup = renderToStaticMarkup(item.message);

    expect(item.key).toBe("notification-42");
    expect(item.autoClose).toBe(5000);
    expect(markup).toContain("Новое сообщение");
    expect(markup).toContain("Текст сообщения");
  });
});
