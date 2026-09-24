import { describe, expect, it } from "vitest";
import {
  applyAccentColor,
  buildTheme,
  chatballsTheme,
  getAccentVariables,
  getThemePreset,
  presetChatballsDark,
  presetChatballsDefault,
  presetGpnDark,
  presetGpnDefault,
} from "./theme";

describe("theme module", () => {
  it("exports valid base and default presets", () => {
    expect(presetGpnDefault).toBeDefined();
    expect(presetGpnDark).toBeDefined();
    expect(presetChatballsDefault).toBe(presetGpnDefault);
    expect(presetChatballsDark).toBe(presetGpnDark);
    expect(chatballsTheme).toBe(presetChatballsDefault);
  });

  it("getThemePreset returns light and dark presets", () => {
    expect(getThemePreset(false)).toBe(presetGpnDefault);
    expect(getThemePreset(true)).toBe(presetGpnDark);
  });

  it("getAccentVariables generates correct CSS variables", () => {
    const varsLight = getAccentVariables("#0070F0", false);
    expect(varsLight["--color-control-bg-primary"]).toBe("#0070F0");
    expect(varsLight["--color-typo-brand"]).toBe("#0070F0");
    expect(varsLight["--color-bg-brand"]).toBe("#0070F0");
    expect(varsLight["--color-control-bg-primary-hover"]).toContain("color-mix");

    const varsDark = getAccentVariables("#2985F8", true);
    expect(varsDark["--color-control-bg-primary"]).toBe("#2985F8");
    expect(varsDark["--color-typo-brand"]).toBe("#2985F8");

    const emptyVars = getAccentVariables("");
    expect(emptyVars).toEqual({});
  });

  it("applyAccentColor applies CSS variables to a target element", () => {
    const props: Record<string, string> = {};
    const mockElement = {
      style: {
        setProperty: (key: string, value: string) => {
          props[key] = value;
        },
        getPropertyValue: (key: string) => props[key],
      },
    } as unknown as HTMLElement;

    applyAccentColor("#0070F0", false, mockElement);
    expect(props["--color-control-bg-primary"]).toBe("#0070F0");
    expect(props["--color-typo-brand"]).toBe("#0070F0");
  });

  it("buildTheme returns appropriate preset and applies accent", () => {
    const light = buildTheme(false, "#0070F0");
    expect(light).toBe(presetGpnDefault);

    const dark = buildTheme(true, "#2985F8");
    expect(dark).toBe(presetGpnDark);
  });
});
