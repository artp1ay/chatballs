import { ContextMenu, type ContextMenuPropGetItemAs } from "@consta/uikit/ContextMenu";
import { Popover } from "@consta/uikit/Popover";
import {
  cloneElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type Ref,
  type RefObject,
} from "react";

import type {
  ConstaMenuProps,
  MenuTriggerProps,
  NormalizedMenuItem,
} from "./menuTypes";
import { handleMenuItemFocus, handleMenuNavigation, useMenuEscapeLayer } from "./menuNavigation";
import {
  directionFor,
  itemItems,
  menuClassName,
  normalizeItems,
  possibleDirections,
} from "./menuUtils";

export type { LegacyMenuItem } from "./menuTypes";

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref) (ref as { current: T | null }).current = value;
}

const getMenuItemAs: ContextMenuPropGetItemAs<NormalizedMenuItem> = () => "div" as const;

function isSelected(item: NormalizedMenuItem): boolean {
  return /(?:^|\s)(?:is-checked|is-selected)(?:\s|$)/.test(item.className);
}

/** Единый Consta UI ContextMenu/Popover с прежним декларативным API меню. */
export function ConstaMenu({
  children,
  menu,
  items: itemsProp,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  disabled = false,
  placement,
  overlayClassName,
  trigger = ["click"],
  popupRender,
  popupRole = "menu",
}: ConstaMenuProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const visible = openProp ?? internalOpen;
  useMenuEscapeLayer(visible);
  const anchorRef = useRef<HTMLElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const child = children as ReactElement<MenuTriggerProps>;
  const childRef = child.props.ref;
  const direction = directionFor(placement);

  const setOpen = useCallback((next: boolean) => {
    if (openProp === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  }, [onOpenChange, openProp]);

  const setAnchorRef = useCallback((node: HTMLElement | null) => {
    anchorRef.current = node;
    assignRef(childRef, node);
  }, [childRef]);

  const handleClick = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    child.props.onClick?.(event);
    if (disabled || event.defaultPrevented) return;
    setOpen(!visible);
  }, [child.props, disabled, setOpen, visible]);

  const handleContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    child.props.onContextMenu?.(event);
    if (disabled || event.defaultPrevented) return;
    event.preventDefault();
    setOpen(!visible);
  }, [child.props, disabled, setOpen, visible]);

  const triggerNode = cloneElement(child, {
    ref: setAnchorRef,
    disabled: disabled || child.props.disabled,
    onClick: trigger.includes("click") ? handleClick : child.props.onClick,
    onContextMenu: trigger.includes("contextMenu") ? handleContextMenu : child.props.onContextMenu,
    "aria-expanded": !disabled && visible,
    "aria-haspopup": popupRender ? popupRole : "menu",
  } as MenuTriggerProps);

  const items = normalizeItems(itemItems(menu, itemsProp));
  const close = useCallback(() => setOpen(false), [setOpen]);
  const closeAndRestore = useCallback(() => {
    close();
    anchorRef.current?.focus({ preventScroll: true });
  }, [close]);

  useEffect(() => {
    if (!visible || !popupRender) return undefined;
    const frame = window.requestAnimationFrame(() => {
      popupRef.current?.querySelector<HTMLElement>("button:not([disabled]), a[href], input:not([disabled])")
        ?.focus({ preventScroll: true });
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeAndRestore();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeAndRestore, popupRender, visible]);

  const popup = popupRender ? (
    <Popover
      anchorRef={anchorRef as RefObject<HTMLElement>}
      className={menuClassName(overlayClassName, false)}
      direction={direction}
      possibleDirections={possibleDirections(direction)}
      offset={4}
      isInteractive
      onClickOutside={close}
    >
      <div className="app-popover-content" ref={popupRef} role={popupRole}>{popupRender()}</div>
    </Popover>
  ) : (
    <ContextMenu
      className={menuClassName(overlayClassName)}
      isOpen={!disabled && visible}
      anchorRef={anchorRef as RefObject<HTMLElement>}
      direction={direction}
      possibleDirections={possibleDirections(direction)}
      offset={4}
      size="s"
      role="menu"
      items={items}
      getItemKey={(item: NormalizedMenuItem) => item.key}
      getItemLabel={(item: NormalizedMenuItem) => item.label as unknown as string}
      getItemSubMenu={(item: NormalizedMenuItem) => item.subMenu}
      getItemDisabled={(item: NormalizedMenuItem) => item.disabled || undefined}
      getItemAs={getMenuItemAs}
      getItemAttributes={(item: NormalizedMenuItem) => {
        const actionItem = item.kind === "item" && !item.custom;
        return {
          className: item.className,
          role: item.kind === "divider" ? "separator" : actionItem ? "menuitem" : "presentation",
          "aria-disabled": actionItem && item.disabled ? true : undefined,
          "aria-current": actionItem && isSelected(item) ? "true" : undefined,
          onFocus: actionItem && !item.disabled ? undefined : handleMenuItemFocus,
        };
      }}
      getItemStatus={(item: NormalizedMenuItem) => {
        if (item.className.includes("danger")) return "alert";
        if (item.className.includes("warning")) return "warning";
        if (item.className.includes("success")) return "success";
        return undefined;
      }}
      getItemOnClick={(item: NormalizedMenuItem) => item.action}
      onKeyDownCapture={handleMenuNavigation}
      onItemClick={(item: NormalizedMenuItem) => {
        if (item.disabled || item.kind !== "item" || item.custom || item.subMenu?.length) return;
        close();
      }}
      onClickOutside={close}
      onEsc={close}
    />
  );

  return (
    <>
      {triggerNode}
      {visible && !disabled && popup}
    </>
  );
}
