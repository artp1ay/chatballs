import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { NotificationDrawer } from "./NotificationDrawer";
import type { AppNotification } from "./model";

// Sidebar использует портал и ожидает DOM. В SSR-тесте подменяем только его
// внешнюю оболочку, чтобы проверить композицию содержимого NotificationDrawer.
vi.mock("@consta/uikit/Sidebar", () => ({
  Sidebar: ({ isOpen, children, className }: { isOpen?: boolean; children?: ReactNode; className?: string }) => (
    isOpen ? <div className={className}>{children}</div> : null
  ),
}));

const sampleItems: AppNotification[] = [
  {
    id: 1,
    type: "conversation",
    level: "INFO",
    title: "Тестовое уведомление",
    body: "Описание уведомления",
    targetRoute: "chat",
    targetId: "1",
    createdAt: new Date().toISOString(),
    unread: true,
  },
];

describe("NotificationDrawer", () => {
  it("рендерит шторку Consta UI Sidebar в закрытом состоянии", () => {
    const html = renderToStaticMarkup(
      <NotificationDrawer
        open={false}
        items={[]}
        unreadCount={0}
        onClose={() => undefined}
        onItemClick={() => undefined}
        onMarkAll={() => undefined}
      />,
    );
    // При закрытом isOpen={false} контент Sidebar не выводится.
    expect(html).toBe("");
  });

  it("рендерит шторку Consta UI Sidebar с уведомлениями и кнопкой прочтения", () => {
    const html = renderToStaticMarkup(
      <NotificationDrawer
        open={true}
        items={sampleItems}
        unreadCount={1}
        onClose={() => undefined}
        onItemClick={() => undefined}
        onMarkAll={() => undefined}
      />,
    );
    expect(html).toContain("notification-sidebar");
    expect(html).toContain("Тестовое уведомление");
    expect(html).toContain("notif-mark-all");
  });

  it("рендерит пустое состояние при отсутствии уведомлений", () => {
    const html = renderToStaticMarkup(
      <NotificationDrawer
        open={true}
        items={[]}
        unreadCount={0}
        onClose={() => undefined}
        onItemClick={() => undefined}
        onMarkAll={() => undefined}
      />,
    );
    expect(html).toContain("notification-sidebar");
    expect(html).toContain("notif-empty");
  });
});
