import { applyAccentColor } from "@chatballs/ui";
import { t } from "../i18n";

// Применение персональной темы и акцента (SPEC-CHATBALLS-0031 §7, дизайн-базлайн v2).
// Тема ставится атрибутом data-theme на <html>; акцент — переменной --accent,
// из неё в CSS считаются --primary (в тёмной теме приглушён подложкой, как в
// дизайн-базлайне) и производные оттенки через color-mix.
// Также обновляются CSS-переменные Consta UI (--color-control-bg-primary, --color-typo-brand и др.).

export type UiTheme = "LIGHT" | "DARK" | "SYSTEM";

export const DEFAULT_ACCENT = "#0f9b8e";

// Пресеты акцента; первый — цвет продукта по умолчанию.
export const ACCENT_PRESETS: Array<[string, string]> = [
  ["#0f9b8e", t("shared.teal")],
  ["#1677ff", t("shared.blue")],
  ["#6d5dfc", t("shared.indigo")],
  ["#e8590c", t("shared.orange")],
];

const media = typeof window !== "undefined" && window.matchMedia
  ? window.matchMedia("(prefers-color-scheme: dark)")
  : null;

let currentTheme: UiTheme = "SYSTEM";
let listenerBound = false;

export function resolvedDark(theme: UiTheme): boolean {
  if (theme === "DARK") return true;
  if (theme === "LIGHT") return false;
  return Boolean(media?.matches);
}

export function applyAppearance(theme: UiTheme, accent: string): void {
  currentTheme = theme;
  const dark = resolvedDark(theme);
  const effectiveAccent = accent || DEFAULT_ACCENT;
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  root.style.setProperty("--accent", effectiveAccent);
  applyAccentColor(effectiveAccent, dark, root);
  if (media && !listenerBound) {
    listenerBound = true;
    media.addEventListener("change", () => {
      if (currentTheme === "SYSTEM") {
        const sysDark = Boolean(media.matches);
        document.documentElement.dataset.theme = sysDark ? "dark" : "light";
        applyAccentColor(effectiveAccent, sysDark, document.documentElement);
      }
    });
  }
}
