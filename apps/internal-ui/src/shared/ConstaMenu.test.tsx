import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const lastContextMenuProps = vi.fn();

vi.mock("@consta/uikit/ContextMenu", () => ({
  ContextMenu: (props: any) => {
    lastContextMenuProps(props);
    if (!props.isOpen) return null;
    return (
      <div className={props.className} role="menu">
        {props.items.map((item: any) => {
          const attributes = props.getItemAttributes?.(item) ?? {};
          return (
            <div key={item.key} {...attributes}>
              {props.getItemLabel?.(item)}
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

    const props = lastContextMenuProps.mock.calls.at(-1)?.[0];
    expect(props.getItemAs(props.items[0])).toBe("div");
    expect(props.getItemAttributes(props.items[0]).role).toBe("menuitem");
    expect(props.getItemAttributes(props.items[1]).role).toBe("separator");
    expect(props.getItemAttributes(props.items[2]).role).toBe("presentation");
    expect(html).toContain("app-consta-menu");
    expect(html).toContain("is-wide");
    expect(html).toContain("Первый");
    expect(html).toContain("app-menu-divider");
    expect(html).toContain("app-menu-group");
    expect(html).toContain("Группа");
  });

  it("выполняет действие через getItemOnClick и закрывает через onItemClick ровно один раз", () => {
    const onAction = vi.fn();
    const onOpenChange = vi.fn();
    renderToStaticMarkup(
      <ConstaMenu
        open
        onOpenChange={onOpenChange}
        menu={{
          items: [
            {
              key: "act",
              label: <button type="button" onClick={onAction}>Действие</button>,
              onClick: onAction,
            },
          ],
        }}
      >
        <button type="button">Открыть</button>
      </ConstaMenu>,
    );

    const props = lastContextMenuProps.mock.calls.at(-1)?.[0];
    expect(props).toBeDefined();
    const item = props.items[0];
    const event = { stopPropagation: vi.fn(), preventDefault: vi.fn() };
    props.getItemOnClick(item)(event);
    props.onItemClick(item, { e: event });

    expect(item.onClick).toBeUndefined();
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("поддерживает активацию с клавиатуры для пунктов с декларативным item.onClick", () => {
    const onAction = vi.fn();
    const onOpenChange = vi.fn();
    renderToStaticMarkup(
      <ConstaMenu
        open
        onOpenChange={onOpenChange}
        menu={{
          items: [
            {
              key: "keyboard-item",
              label: "Пункт",
              onClick: onAction,
            },
          ],
        }}
      >
        <button type="button">Открыть</button>
      </ConstaMenu>,
    );

    const props = lastContextMenuProps.mock.calls.at(-1)?.[0];
    const item = props.items[0];
    const event = { stopPropagation: vi.fn(), preventDefault: vi.fn() };
    props.getItemOnClick(item)(event);
    props.onItemClick(item, { e: event });

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("передаёт выбранный пункт в aria-current", () => {
    renderToStaticMarkup(
      <ConstaMenu
        open
        onOpenChange={() => undefined}
        menu={{ items: [{ key: "selected", className: "is-checked", label: "Выбрано" }] }}
      >
        <button type="button">Открыть</button>
      </ConstaMenu>,
    );

    const props = lastContextMenuProps.mock.calls.at(-1)?.[0];
    expect(props.getItemAttributes(props.items[0])["aria-current"]).toBe("true");
  });

  it("не выполняет действие и не закрывает меню для заблокированного пункта", () => {
    const onAction = vi.fn();
    const onOpenChange = vi.fn();
    renderToStaticMarkup(
      <ConstaMenu
        open
        onOpenChange={onOpenChange}
        menu={{
          items: [
            {
              key: "disabled-item",
              disabled: true,
              label: "Недоступно",
              onClick: onAction,
            },
          ],
        }}
      >
        <button type="button">Открыть</button>
      </ConstaMenu>,
    );

    const props = lastContextMenuProps.mock.calls.at(-1)?.[0];
    const item = props.items[0];
    expect(props.getItemOnClick(item)).toBeUndefined();
    expect(props.getItemAttributes(item)["aria-disabled"]).toBe(true);
    props.onItemClick(item, { e: {} });

    expect(onAction).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
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

    const props = lastContextMenuProps.mock.calls.at(-1)?.[0];
    const attributes = props.getItemAttributes(props.items[0]);
    expect(attributes.role).toBe("presentation");
    expect(attributes["aria-disabled"]).toBeUndefined();
    expect(html).toContain("app-menu-inline-control");
    expect(html).toContain("Поиск");
    expect(html).not.toContain("<button disabled=\"true\"><input");
  });

  it("использует Popover для пользовательской панели", () => {
    const html = renderToStaticMarkup(
      <ConstaMenu
        open
        onOpenChange={() => undefined}
        popupRole="listbox"
        popupRender={() => <div role="presentation">Панель</div>}
      >
        <button type="button">Открыть панель</button>
      </ConstaMenu>,
    );

    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('role="listbox"');
    expect(html).toContain("app-consta-popover");
    expect(html).toContain("Панель");
  });
});
