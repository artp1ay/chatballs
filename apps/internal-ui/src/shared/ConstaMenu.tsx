import { ContextMenu } from "@consta/uikit/ContextMenu";
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

/**
 * Единый адаптер меню для функциональных разделов. Нативная отрисовка и
 * позиционирование выполняются Consta UI; адаптер сохраняет привычный API
 * компонентов, чтобы миграция не затронула бизнес-логику и существующие
 * состояния открытия.
 */
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
}: ConstaMenuProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const visible = openProp ?? internalOpen;
  const anchorRef = useRef<HTMLElement | null>(null);
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
    "aria-haspopup": "menu",
  } as MenuTriggerProps);

  const items = normalizeItems(itemItems(menu, itemsProp));
  const close = () => setOpen(false);
  const handleItemClick = (
    item: NormalizedMenuItem,
    event?: ReactMouseEvent<any>,
  ) => {
    if (item.disabled || item.kind !== "item" || item.custom) return;
    if (item.subMenu?.length) return;
    item.action?.(event ?? ({} as ReactMouseEvent<any>));
    close();
  };

  useEffect(() => {
    if (!visible || !popupRender) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, popupRender, visible]);

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
      <div className="app-popover-content">{popupRender()}</div>
    </Popover>
  ) : (
    <ContextMenu
      className={menuClassName(overlayClassName)}
      isOpen={!disabled && visible}
      anchorRef={anchorRef as unknown as RefObject<HTMLElement>}
      direction={direction}
      possibleDirections={possibleDirections(direction)}
      offset={4}
      size="s"
      role="menu"
      items={items as never[]}
      getItemKey={(item: NormalizedMenuItem) => item.key}
      getItemLabel={(item: NormalizedMenuItem) => item.label as unknown as string}
      getItemDisabled={(item: NormalizedMenuItem) => item.disabled}
      getItemAs={() => "div"}
      getItemAttributes={(item: NormalizedMenuItem) => ({
        className: item.className,
        role: item.kind === "item" ? "menuitem" : "presentation",
        "aria-hidden": item.kind === "divider" ? true : undefined,
      })}
      getItemStatus={(item: NormalizedMenuItem) => {
        if (item.className.includes("danger")) return "alert";
        if (item.className.includes("warning")) return "warning";
        if (item.className.includes("success")) return "success";
        return undefined;
      }}
      onItemClick={(item: NormalizedMenuItem, params: { e: ReactMouseEvent<any> }) => {
        handleItemClick(item, params?.e);
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
