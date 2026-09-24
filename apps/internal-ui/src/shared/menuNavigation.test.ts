import { afterEach, describe, expect, it, vi } from "vitest";

import { handleMenuItemFocus, handleMenuNavigation } from "./menuNavigation";

class FakeElement {
  readonly focus = vi.fn();
  readonly click = vi.fn();
  readonly role: string | null;
  readonly disabled: boolean;
  readonly children: FakeElement[];
  parent: FakeElement | null = null;

  constructor(role: string | null, options: { disabled?: boolean; children?: FakeElement[] } = {}) {
    this.role = role;
    this.disabled = Boolean(options.disabled);
    this.children = options.children ?? [];
    this.children.forEach((child) => { child.parent = this; });
  }

  closest(selector: string): FakeElement | null {
    if (selector.includes("[role='menuitem']") && this.role === "menuitem") return this;
    if (selector.includes("[role='menu']")) {
      let current: FakeElement | null = this;
      while (current) {
        if (current.role === "menu") return current;
        current = current.parent;
      }
    }
    if (selector.includes("[role]") && this.role) return this;
    return null;
  }

  getAttribute(name: string): string | null {
    if (name === "role") return this.role;
    if (name === "aria-disabled") return this.disabled ? "true" : null;
    return null;
  }

  querySelector(): FakeElement | null {
    return this.children[0] ?? null;
  }

  querySelectorAll(): FakeElement[] {
    return this.children.filter((child) => child.role === "menuitem" && !child.disabled);
  }
}

function keyboardEvent(key: string, currentTarget: FakeElement, target: FakeElement) {
  return {
    key,
    currentTarget,
    target,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("навигация ConstaMenu", () => {
  it("активирует сфокусированный пункт один раз через Enter", () => {
    vi.stubGlobal("Element", FakeElement);
    vi.stubGlobal("HTMLElement", FakeElement);
    const item = new FakeElement("menuitem");
    const root = new FakeElement("menu", { children: [item] });
    const event = keyboardEvent("Enter", root, item);

    handleMenuNavigation(event as never);

    expect(item.click).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  });

  it("переводит стрелками на следующий доступный пункт", () => {
    vi.stubGlobal("Element", FakeElement);
    vi.stubGlobal("HTMLElement", FakeElement);
    const current = new FakeElement("menuitem");
    const next = new FakeElement("menuitem");
    const root = new FakeElement("menu", { children: [current, next] });
    const event = keyboardEvent("ArrowDown", root, current);

    handleMenuNavigation(event as never);

    expect(next.focus).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("передаёт фокус с группового пункта на вложенное поле", () => {
    vi.stubGlobal("Element", FakeElement);
    vi.stubGlobal("HTMLElement", FakeElement);
    const input = new FakeElement(null);
    const group = new FakeElement("presentation", { children: [input] });
    const event = { currentTarget: group, target: group };

    handleMenuItemFocus(event as never);

    expect(input.focus).toHaveBeenCalledWith({ preventScroll: true });
  });
});
