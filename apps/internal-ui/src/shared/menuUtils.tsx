import {
  Children,
  cloneElement,
  isValidElement,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import type { Direction } from "@consta/uikit/Popover";

import type {
  LegacyMenuItem,
  MenuConfig,
  MenuPlacement,
  NormalizedMenuItem,
} from "./menuTypes";

const PLACEMENT_DIRECTIONS: Record<MenuPlacement, Direction> = {
  topLeft: "upStartLeft",
  topCenter: "upCenter",
  topRight: "upStartRight",
  bottomLeft: "downStartLeft",
  bottomCenter: "downCenter",
  bottomRight: "downStartRight",
  leftTop: "leftStartUp",
  leftBottom: "leftStartDown",
  rightTop: "rightStartUp",
  rightBottom: "rightStartDown",
};

export function itemItems(config: MenuConfig | undefined, fallback?: LegacyMenuItem[]): LegacyMenuItem[] {
  if (fallback) return fallback;
  if (Array.isArray(config)) return config;
  return config?.items ?? [];
}

function hasInteractiveDescendant(node: ReactNode): boolean {
  return Children.toArray(node).some((child) => {
    if (!isValidElement(child)) return false;
    if (child.type === "input" || child.type === "textarea" || child.type === "select" || child.type === "button") return true;
    return hasInteractiveDescendant((child.props as { children?: ReactNode }).children);
  });
}

function joinClassName(...values: Array<string | undefined | false>): string {
  return values.filter(Boolean).join(" ");
}

/** Нормализует декларативный пункт меню в элемент ContextMenu. */
export function normalizeItem(item: LegacyMenuItem, index: number): NormalizedMenuItem[] {
  const kind = item.type === "divider" ? "divider" : item.type === "group" ? "group" : "item";
  const key = String(item.key ?? `menu-${index}`);
  const disabled = Boolean(item.disabled) || kind !== "item";

  if (kind === "divider") {
    return [{
      ...item,
      key: `${key}-divider`,
      kind,
      label: null,
      className: joinClassName("app-menu-divider", item.className),
      custom: false,
      disabled: true,
    }];
  }

  const label = item.label;
  const labelIsButton = isValidElement(label) && label.type === "button";
  const custom = !labelIsButton && (
    (isValidElement(label) && typeof label.type !== "string")
    || hasInteractiveDescendant(label)
  );
  let normalizedLabel: ReactNode = label;
  let labelClassName = "";

  if (labelIsButton) {
    const props = label.props as {
      children?: ReactNode;
      className?: string;
      disabled?: boolean;
      type?: string;
      onClick?: (event: ReactMouseEvent<HTMLElement>) => void;
    };
    labelClassName = props.className ?? "";
    const handleClick = (event: ReactMouseEvent<HTMLElement>) => {
      props.onClick?.(event);
      item.onClick?.(event);
    };
    normalizedLabel = cloneElement(label, {
      type: "button",
      disabled: disabled || props.disabled,
      className: joinClassName("app-dropdown-item-button", labelClassName),
      onClick: disabled ? undefined : handleClick,
    } as Partial<unknown>);
  } else if (custom) {
    labelClassName = isValidElement(label)
      ? ((label.props as { className?: string }).className ?? "")
      : "";
    normalizedLabel = label;
  } else if (kind === "group") {
    normalizedLabel = <span className="app-menu-group-label">{label}</span>;
  } else {
    const handleClick = (event: ReactMouseEvent<HTMLElement>) => item.onClick?.(event);
    normalizedLabel = (
      <button
        className="app-dropdown-item-button"
        type="button"
        disabled={disabled}
        onClick={disabled ? undefined : handleClick}
      >
        {label}
      </button>
    );
  }

  const normalized: NormalizedMenuItem = {
    ...item,
    key,
    kind,
    label: normalizedLabel,
    className: joinClassName(
      kind === "group" ? "app-menu-group" : "app-menu-item",
      item.className,
      labelClassName,
    ),
    custom,
    disabled,
  };

  if (kind === "group" && item.children?.length) {
    return [
      normalized,
      ...item.children.flatMap((child, childIndex) => normalizeItem(child, index + childIndex + 1)),
    ];
  }
  if (item.children?.length) {
    normalized.subMenu = item.children.flatMap((child, childIndex) => normalizeItem(child, index + childIndex + 1));
  }
  return [normalized];
}

export function normalizeItems(items: LegacyMenuItem[]): NormalizedMenuItem[] {
  return items.flatMap((item, index) => normalizeItem(item, index));
}

export function menuClassName(overlayClassName: string | undefined, legacyMenu = true): string {
  return joinClassName("app-dropdown", legacyMenu ? "app-dropdown-menu" : "", overlayClassName, legacyMenu ? "app-consta-menu" : "app-consta-popover");
}

export function directionFor(placement: MenuPlacement | undefined): Direction {
  return PLACEMENT_DIRECTIONS[placement ?? "bottomLeft"];
}

export function possibleDirections(direction: Direction): Direction[] {
  const fallback: Record<string, Direction> = {
    upStartLeft: "downStartLeft",
    downStartLeft: "upStartLeft",
    upStartRight: "downStartRight",
    downStartRight: "upStartRight",
    upCenter: "downCenter",
    downCenter: "upCenter",
    leftStartUp: "rightStartUp",
    rightStartUp: "leftStartUp",
    leftStartDown: "rightStartDown",
    rightStartDown: "leftStartDown",
  };
  return [direction, fallback[direction] ?? direction];
}
