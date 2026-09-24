import {
  presetGpnDark,
  presetGpnDefault,
  type ThemePreset,
} from "@consta/uikit/Theme";

export { presetGpnDark, presetGpnDefault, type ThemePreset };

/** Пресет светлой темы Chatballs по умолчанию */
export const presetChatballsDefault: ThemePreset = presetGpnDefault;

/** Пресет тёмной темы Chatballs */
export const presetChatballsDark: ThemePreset = presetGpnDark;

/** Базовый пресет темы Chatballs */
export const chatballsTheme: ThemePreset = presetChatballsDefault;

/**
 * Возвращает пресет темы Consta UI в зависимости от режима (светлый/тёмный).
 */
export function getThemePreset(dark: boolean): ThemePreset {
  return dark ? presetGpnDark : presetGpnDefault;
}

/**
 * Генерирует словарь CSS-переменных для инъекции акцентного цвета в тему Consta UI.
 */
export function getAccentVariables(accent: string, dark = false): Record<string, string> {
  if (!accent) return {};

  const hover = dark
    ? `color-mix(in srgb, ${accent} 85%, white)`
    : `color-mix(in srgb, ${accent} 85%, black)`;
  const active = dark
    ? `color-mix(in srgb, ${accent} 75%, white)`
    : `color-mix(in srgb, ${accent} 75%, black)`;

  return {
    "--color-control-bg-primary": accent,
    "--color-control-bg-primary-hover": hover,
    "--color-control-bg-border-secondary": accent,
    "--color-control-bg-border-secondary-hover": hover,
    "--color-control-typo-secondary": accent,
    "--color-control-typo-secondary-hover": hover,
    "--color-control-bg-border-focus": hover,
    "--color-control-bg-focus": `color-mix(in srgb, ${accent} 30%, transparent)`,
    "--color-control-bg-active": active,
    "--color-typo-brand": accent,
    "--color-bg-brand": accent,
    "--color-bg-link": accent,
    "--color-typo-link": accent,
    "--color-typo-link-hover": hover,
  };
}

/**
 * Применяет CSS-переменные акцентного цвета к целевому элементу (по умолчанию document.documentElement).
 */
export function applyAccentColor(
  accent: string,
  dark = false,
  target?: HTMLElement,
): void {
  if (typeof document === "undefined" && !target) return;
  const el = target ?? document.documentElement;
  const vars = getAccentVariables(accent, dark);
  for (const [key, value] of Object.entries(vars)) {
    el.style.setProperty(key, value);
  }
}

/**
 * Собирает пресет темы Consta UI и при необходимости применяет CSS-переменные акцентного цвета.
 */
export function buildTheme(dark: boolean, accent?: string): ThemePreset {
  if (accent) {
    applyAccentColor(accent, dark);
  }
  return getThemePreset(dark);
}
