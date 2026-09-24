import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@consta/uikit/ContextMenu", () => ({
  ContextMenu: ({ isOpen, items, className, getItemLabel, getItemLeftSide, getItemAttributes }: any) => {
    if (!isOpen) return null;
    return (
      <div className={`ContextMenu ${className ?? ""}`} role="menu">
        {items.map((item: any) => (
          <div key={item.key} {...(getItemAttributes?.(item) ?? {})}>
            {getItemLeftSide?.(item)}
            <span>{getItemLabel ? getItemLabel(item) : item.label}</span>
          </div>
        ))}
      </div>
    );
  },
}));

import { FilterDropdown, SelectMenu, type SelectOption } from "./SelectMenu";

const options: SelectOption[] = [
  { value: "all", label: "Все" },
  { value: "active", label: "Активные", dot: "#10b981" },
  { value: "archived", label: "В архиве" },
];

describe("SelectMenu", () => {
  it("рендерит триггер и не показывает выпадающий список в закрытом состоянии", () => {
    const html = renderToStaticMarkup(
      <SelectMenu
        open={false}
        options={options}
        selected={["all"]}
        onOpenChange={() => undefined}
        onSelect={() => undefined}
      >
        <button type="button">Открыть</button>
      </SelectMenu>,
    );

    expect(html).toContain("Открыть");
    expect(html).not.toContain("ContextMenu");
  });

  it("рендерит опции в открытом состоянии с отметкой выбранного пункта", () => {
    const html = renderToStaticMarkup(
      <SelectMenu
        open={true}
        options={options}
        selected={["active"]}
        onOpenChange={() => undefined}
        onSelect={() => undefined}
      >
        <button type="button">Открыть</button>
      </SelectMenu>,
    );

    expect(html).toContain("ContextMenu");
    expect(html).toContain("Активные");
    expect(html).toContain("is-selected");
    expect(html).toContain('role="menuitem"');
    expect(html).toContain('type="button"');
    expect(html).toContain('style="background:#10b981"');
  });

  it("поддерживает multiple режим с галочками", () => {
    const html = renderToStaticMarkup(
      <SelectMenu
        open={true}
        multiple={true}
        options={options}
        selected={["active", "archived"]}
        onOpenChange={() => undefined}
        onSelect={() => undefined}
      >
        <button type="button">Фильтры</button>
      </SelectMenu>,
    );

    expect(html).toContain("ui-filter-check is-on");
  });
});

describe("FilterDropdown", () => {
  it("рендерит кнопку фильтра с подписью caption, меткой и счетчиком при multiple", () => {
    const html = renderToStaticMarkup(
      <FilterDropdown
        label="Статус"
        caption="Фильтр:"
        icon="list"
        multiple={true}
        open={false}
        options={options}
        selected={["active", "archived"]}
        onOpenChange={() => undefined}
        onSelect={() => undefined}
      />,
    );

    expect(html).toContain("ui-filter-button");
    expect(html).toContain("is-active");
    expect(html).toContain("ui-filter-caption");
    expect(html).toContain("Фильтр:");
    expect(html).toContain("Статус");
    expect(html).toContain("<span>2</span>");
  });
});
