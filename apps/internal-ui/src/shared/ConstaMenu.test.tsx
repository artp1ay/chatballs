import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@consta/uikit/ContextMenu", () => ({
  ContextMenu: ({ isOpen, items, className, getItemLabel, getItemAttributes }: any) => {
    if (!isOpen) return null;
    return (
      <div className={className} role="menu">
        {items.map((item: any) => {
          const attributes = getItemAttributes?.(item) ?? {};
          return (
            <div key={item.key} {...attributes}>
              {getItemLabel?.(item)}
            </div>
          );
        })}
      </div>
    );
  },
}));

vi.mock("@consta/uikit/Popover", () => ({
  Popover: ({ children, className }: any) => <div className={className}>{children}</div>,
}));

import { ConstaMenu } from "./ConstaMenu";

function SearchLikeControl() {
  return <input aria-label="Поиск" />;
}

describe("ConstaMenu", () => {
  it("рендерит триггер и скрывает меню в закрытом состоянии", () => {
    const html = renderToStaticMarkup(
      <ConstaMenu open={false} onOpenChange={() => undefined} menu={{ items: [{ key: "one", label: "Первый" }] }}>
        <button type="button">Открыть</button>
      </ConstaMenu>,
    );

    expect(html).toContain("Открыть");
    expect(html).not.toContain("ContextMenu");
  });

  it("передаёт в ContextMenu обычные пункты, разделитель и заголовок группы", () => {
    const html = renderToStaticMarkup(
      <ConstaMenu
        open
        onOpenChange={() => undefined}
        overlayClassName="is-wide"
        menu={{
          items: [
            { key: "one", label: <button type="button">Первый</button> },
            { type: "divider", key: "split" },
            { key: "group", type: "group", label: "Группа" },
          ],
        }}
      >
        <button type="button">Открыть</button>
      </ConstaMenu>,
    );

    expect(html).toContain("app-consta-menu");
    expect(html).toContain("is-wide");
    expect(html).toContain("Первый");
    expect(html).toContain("app-menu-divider");
    expect(html).toContain("app-menu-group");
    expect(html).toContain("Группа");
  });

  it("не оборачивает пользовательский input-контроль в кнопку", () => {
    const html = renderToStaticMarkup(
      <ConstaMenu
        open
        onOpenChange={() => undefined}
        menu={{ items: [{ key: "search", type: "group", label: <SearchLikeControl /> }] }}
      >
        <button type="button">Открыть</button>
      </ConstaMenu>,
    );

    expect(html).toContain("Поиск");
    expect(html).not.toContain("<button disabled=\"true\"><input");
  });

  it("использует Popover для пользовательской панели", () => {
    const html = renderToStaticMarkup(
      <ConstaMenu open onOpenChange={() => undefined} popupRender={() => <div role="listbox">Панель</div>}>
        <button type="button">Открыть панель</button>
      </ConstaMenu>,
    );

    expect(html).toContain("app-consta-popover");
    expect(html).toContain("Панель");
  });
});
