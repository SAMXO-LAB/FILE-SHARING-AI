import { customThemeSchema, customThemeVars, RADIUS, readableOn, THEMES } from "@/lib/themes";
import type { Preferences } from "@/lib/types";

export interface ThemeState {
  attrs: Record<string, string>;
  style: Record<string, string>;
}

export const DEFAULT_THEME_STATE: ThemeState = {
  attrs: { "data-theme": "liquid-glass", "data-mode": "dark", "data-color-mode": "system", "data-bg": "gradient", "data-sidebar-style": "glass", "data-bubble": "soft", "data-anim": "normal", "data-contrast": "normal" },
  style: { "--accent": "#7c8cff", "--accent-fg": "#ffffff", "--radius": RADIUS.lg! },
};

export function themeFromPrefs(p: Pick<Preferences, "theme" | "color_mode" | "accent_color" | "background_style" | "sidebar_style" | "border_radius" | "chat_bubble_style" | "animation_level" | "high_contrast">, custom?: unknown): ThemeState {
  const attrs: Record<string, string> = {
    "data-theme": THEMES.some((t) => t.id === p.theme) ? p.theme : "liquid-glass",
    "data-mode": "dark",
    "data-color-mode": p.color_mode,
    "data-bg": p.background_style,
    "data-sidebar-style": p.sidebar_style,
    "data-bubble": p.chat_bubble_style,
    "data-anim": p.animation_level,
    "data-contrast": p.high_contrast ? "high" : "normal",
  };
  const style: Record<string, string> = {
    "--accent": p.accent_color,
    "--accent-fg": readableOn(p.accent_color),
    "--radius": RADIUS[p.border_radius] ?? RADIUS.lg!,
  };
  if (p.theme === "custom") {
    const parsed = customThemeSchema.safeParse({ name: "Custom", tokens: (custom as { tokens?: unknown } | null)?.tokens ?? {} });
    if (parsed.success) {
      const { vars, mode } = customThemeVars(parsed.data.tokens);
      Object.assign(style, vars);
      attrs["data-theme"] = "custom";
      attrs["data-mode"] = mode;
      attrs["data-color-mode"] = mode; // a custom theme defines its own mode
    } else {
      attrs["data-theme"] = "liquid-glass";
    }
  }
  return { attrs, style };
}


/** Resolves "system" colour mode in the browser. */
export function resolveMode(colorMode: string): "light" | "dark" {
  if (colorMode === "light" || colorMode === "dark") return colorMode;
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches) return "light";
  return "dark";
}

let appliedVars: string[] = [];

/** Applies a theme to <html> immediately (live preview in Settings, no reload). */
export function applyThemeToDom(state: ThemeState) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(state.attrs)) root.setAttribute(k, v);
  const colorMode = state.attrs["data-color-mode"] ?? "system";
  if (state.attrs["data-theme"] !== "custom") root.setAttribute("data-mode", resolveMode(colorMode));
  for (const k of appliedVars) root.style.removeProperty(k);
  appliedVars = Object.keys(state.style);
  for (const [k, v] of Object.entries(state.style)) root.style.setProperty(k, v);
}
