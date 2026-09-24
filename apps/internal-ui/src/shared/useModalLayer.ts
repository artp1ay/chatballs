import {
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type RefObject,
} from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable='true']",
  "[tabindex]",
].join(",");

const layers: string[] = [];
const listeners = new Set<() => void>();
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
let scrollLockCount = 0;
let previousBodyOverflow = "";

function notifyLayersChanged(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getTopLayer(): string | undefined {
  return layers.at(-1);
}

function isFocusable(element: HTMLElement): boolean {
  if (element.matches(":disabled, [aria-disabled='true'], [inert]")) return false;
  if (element.getAttribute("tabindex") === "-1" || element.closest("[inert]")) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
}

export function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isFocusable);
}

function focusElement(element: HTMLElement): void {
  element.focus({ preventScroll: true });
}

function keepTabInside(event: KeyboardEvent, root: HTMLElement): void {
  if (event.key !== "Tab") return;
  const focusable = getFocusableElements(root);
  const first = focusable[0];
  const last = focusable.at(-1);
  const active = document.activeElement;

  if (!first || !last) {
    event.preventDefault();
    focusElement(root);
    return;
  }
  if (!root.contains(active)) {
    event.preventDefault();
    focusElement(event.shiftKey ? last : first);
    return;
  }
  if (event.shiftKey && active === first) {
    event.preventDefault();
    focusElement(last);
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    focusElement(first);
  }
}

/**
 * Регистрирует окно в общем стеке, блокирует прокрутку страницы, удерживает
 * фокус внутри верхнего диалога и возвращает фокус на элемент, который его
 * открыл. Вложенный ConstaModal
 * временно отключает обработчики родителя, поэтому клик по подложке и Esc
 * обрабатываются только верхним окном.
 */
export function useModalLayer(open: boolean, id: string): {
  isTopmost: boolean;
  modalRef: RefObject<HTMLDivElement | null>;
} {
  const modalRef = useRef<HTMLDivElement>(null);

  useIsomorphicLayoutEffect(() => {
    if (!open) return undefined;
    if (!layers.includes(id)) layers.push(id);
    if (scrollLockCount === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    scrollLockCount += 1;
    notifyLayersChanged();
    return () => {
      const index = layers.lastIndexOf(id);
      if (index >= 0) layers.splice(index, 1);
      scrollLockCount = Math.max(0, scrollLockCount - 1);
      if (scrollLockCount === 0) document.body.style.overflow = previousBodyOverflow;
      notifyLayersChanged();
    };
  }, [id, open]);

  const topLayer = useSyncExternalStore(subscribe, getTopLayer, getTopLayer);
  const isTopmost = !open || topLayer === undefined || topLayer === id;

  useEffect(() => {
    if (!open || !isTopmost) return undefined;
    const root = modalRef.current;
    if (!root) return undefined;

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      if (modalRef.current !== root) return;
      const initial = root.querySelector<HTMLElement>("[data-modal-initial-focus], [autofocus]")
        ?? getFocusableElements(root)[0]
        ?? root;
      focusElement(initial);
    });
    const onKeyDown = (event: KeyboardEvent) => keepTabInside(event, root);
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown, true);
      if (layers.length === 0 && opener?.isConnected && !root.contains(opener)) {
        focusElement(opener);
      }
    };
  }, [isTopmost, open]);

  return { isTopmost, modalRef };
}
