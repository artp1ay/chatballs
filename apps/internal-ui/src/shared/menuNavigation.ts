import { useEffect, type FocusEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";

const MENU_ITEM_SELECTOR = "[role='menuitem']:not([aria-disabled='true'])";
const EDITABLE_SELECTOR = "input, textarea, select, button, a[href], [contenteditable='true']";

let openMenuCount = 0;
let suppressEscapeKeyUp = false;
let resetTimer: ReturnType<typeof setTimeout> | undefined;

function clearResetTimer(): void {
  if (resetTimer !== undefined) clearTimeout(resetTimer);
  resetTimer = undefined;
}

function removeEscapeLayer(): void {
  document.removeEventListener("keydown", onMenuKeyDown, true);
  document.removeEventListener("keyup", onMenuKeyUp, true);
  clearResetTimer();
}

function onMenuKeyDown(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  suppressEscapeKeyUp = true;
  clearResetTimer();
  resetTimer = setTimeout(() => {
    suppressEscapeKeyUp = false;
    resetTimer = undefined;
    if (openMenuCount === 0) removeEscapeLayer();
  }, 1000);
}

function onMenuKeyUp(event: KeyboardEvent): void {
  if (event.key !== "Escape" || !suppressEscapeKeyUp) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  suppressEscapeKeyUp = false;
  clearResetTimer();
  if (openMenuCount === 0) removeEscapeLayer();
}

function addEscapeLayer(): void {
  if (openMenuCount > 0) return;
  document.addEventListener("keydown", onMenuKeyDown, true);
  document.addEventListener("keyup", onMenuKeyUp, true);
}

function menuItems(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR));
}

/** Обходит Consta ContextMenu, не задерживая фокус на заголовках и разделителях. */
export function handleMenuNavigation(event: ReactKeyboardEvent<HTMLElement>): void {
  const target = event.target;
  if (target instanceof Element && target.closest(EDITABLE_SELECTOR)) return;
  if (!(event.currentTarget instanceof HTMLElement)) return;
  const current = target instanceof Element ? target.closest<HTMLElement>("[role='menuitem']") : null;

  if (event.key === "Enter" || event.key === " ") {
    if (!current || current.getAttribute("aria-disabled") === "true") return;
    event.preventDefault();
    event.stopPropagation();
    current.click();
    return;
  }
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;

  const items = menuItems(event.currentTarget);
  if (!items.length) return;
  const currentIndex = current ? items.indexOf(current) : -1;
  const nextIndex = event.key === "Home"
    ? 0
    : event.key === "End"
      ? items.length - 1
      : event.key === "ArrowDown"
        ? Math.min(currentIndex + 1, items.length - 1)
        : Math.max(currentIndex - 1, 0);

  event.preventDefault();
  event.stopPropagation();
  items[nextIndex]?.focus();
}

/** При фокусе служебного пункта сразу передаёт его первому полноценному контролу. */
export function handleMenuItemFocus(event: FocusEvent<HTMLElement>): void {
  if (event.target !== event.currentTarget) return;
  const current = event.currentTarget;
  const nestedControl = current.querySelector<HTMLElement>(`${EDITABLE_SELECTOR}, button, a[href]`);
  if (nestedControl) {
    nestedControl.focus({ preventScroll: true });
    return;
  }

  const root = current.closest<HTMLElement>("[role='menu']");
  const items = root ? menuItems(root) : [];
  const currentIndex = items.indexOf(current);
  items[currentIndex >= 0 ? currentIndex + 1 : 0]?.focus({ preventScroll: true });
}

/** Не даёт верхнему Consta Modal закрыться на keyup после Escape в меню. */
export function useMenuEscapeLayer(open: boolean): void {
  useEffect(() => {
    if (!open) return undefined;
    addEscapeLayer();
    openMenuCount += 1;
    return () => {
      openMenuCount = Math.max(0, openMenuCount - 1);
      if (openMenuCount === 0 && !suppressEscapeKeyUp) removeEscapeLayer();
    };
  }, [open]);
}
