import { z } from "zod";

/**
 * Themes are DATA, never code. A custom theme is a small object of validated colour and enum
 * tokens that we map to CSS custom properties ourselves. No user-supplied CSS or JavaScript is
 * ever accepted, stored or injected.
 */
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const customThemeSchema = z
  .object({
    name: z.string().trim().min(1).max(40).default("Custom"),
    tokens: z
      .object({
        background: hex.optional(),
        backgroundAlt: hex.optional(),
        surface: hex.optional(),
        foreground: hex.optional(),
        muted: hex.optional(),
        accent: hex.optional(),
        glowA: hex.optional(),
        glowB: hex.optional(),
        surfaceOpacity: z.number().min(0.35).max(1).optional(),
        blur: z.number().min(0).max(40).optional(),
        mode: z.enum(["light", "dark"]).optional(),
      })
      .strict(),
  })
  .strict();
export type CustomTheme = z.infer<typeof customThemeSchema>;

export interface ThemeDef {
  id: "liquid-glass" | "midnight" | "amoled" | "minimal-light" | "aurora";
  label: string;
  description: string;
  mode: "light" | "dark";
  vars: Record<string, string>;
  /** Hand-tuned dark variant (otherwise a shared dark base is used). */
  darkVars?: Record<string, string>;
  preview: [string, string, string];
}

/** The product's default accent. */
export const DEFAULT_ACCENT = "#2563eb";
/** The accent stored by earlier versions as the default; treated as "use the default". */
export const LEGACY_DEFAULT_ACCENT = "#7c8cff";

/**
 * Built-in themes: CSS variable sets. `--surface-a` is the card alpha (1 = solid).
 * The id "liquid-glass" is kept for stored preferences; it is the default "Universal" theme.
 */
export const THEMES: ThemeDef[] = [
  {
    id: "liquid-glass", label: "Universal", description: "Bright blue and white. Calm, clear and the default.", mode: "light",
    preview: ["#f8fafc", "#2563eb", "#eff6ff"],
    vars: { "--bg": "#f8fafc", "--bg-2": "#f1f5f9", "--card": "#ffffff", "--surface": "255 255 255", "--surface-a": "1", "--fg": "#0f172a", "--muted": "#64748b", "--subtle": "#94a3b8", "--line": "15 23 42", "--border-a": "0.085", "--glow-a": "#dbeafe", "--glow-b": "#e0f2fe", "--blur": "18px" },
    darkVars: { "--bg": "#0b1120", "--bg-2": "#0f172a", "--card": "#111a2e", "--surface": "17 26 46", "--surface-a": "1", "--fg": "#e6edf7", "--muted": "#94a3b8", "--subtle": "#64748b", "--line": "226 232 240", "--border-a": "0.09", "--glow-a": "#1e3a8a", "--glow-b": "#0c4a6e", "--blur": "18px" },
  },
  {
    id: "midnight", label: "Midnight", description: "Deep blue-black with calm contrast.", mode: "dark",
    preview: ["#0c1220", "#60a5fa", "#a78bfa"],
    vars: { "--bg": "#0b1120", "--bg-2": "#0f172a", "--surface": "148 163 184", "--surface-a": "0.08", "--fg": "#e6edf7", "--muted": "#8b9ab5", "--border-a": "0.14", "--glow-a": "#2563eb", "--glow-b": "#7c3aed", "--blur": "14px" },
  },
  {
    id: "amoled", label: "AMOLED Black", description: "True black for OLED screens, minimal effects.", mode: "dark",
    preview: ["#000000", "#ffffff", "#3b82f6"],
    vars: { "--bg": "#000000", "--bg-2": "#0a0a0a", "--surface": "255 255 255", "--surface-a": "0.05", "--fg": "#f5f5f5", "--muted": "#8a8a8a", "--border-a": "0.16", "--glow-a": "#000000", "--glow-b": "#000000", "--blur": "0px" },
  },
  {
    id: "minimal-light", label: "Minimal Light", description: "Plain white, no tint, no effects.", mode: "light",
    preview: ["#ffffff", "#0f172a", "#e5e7eb"],
    vars: { "--bg": "#ffffff", "--bg-2": "#f4f4f5", "--card": "#ffffff", "--surface": "255 255 255", "--surface-a": "1", "--fg": "#09090b", "--muted": "#52525b", "--line": "9 9 11", "--border-a": "0.1", "--glow-a": "#ffffff", "--glow-b": "#ffffff", "--blur": "10px" },
  },
  {
    id: "aurora", label: "Aurora", description: "Northern-lights gradients with gentle glow.", mode: "dark",
    preview: ["#06141b", "#34d399", "#a78bfa"],
    vars: { "--bg": "#06141b", "--bg-2": "#0b1f2a", "--surface": "200 255 240", "--surface-a": "0.07", "--fg": "#eafff7", "--muted": "#8fb7ab", "--border-a": "0.13", "--glow-a": "#10b981", "--glow-b": "#8b5cf6", "--blur": "20px" },
  },
];

export const RADIUS: Record<string, string> = { sm: "8px", md: "12px", lg: "16px", xl: "22px" };
export const ANIMATION: Record<string, { scale: string }> = { none: { scale: "0" }, subtle: { scale: "0.5" }, normal: { scale: "1" }, rich: { scale: "1.6" } };

const rgb = (hexColor: string) => {
  const n = parseInt(hexColor.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

/** Returns the CSS variables for a custom theme, built only from validated tokens. */
export function customThemeVars(t: CustomTheme["tokens"]): { vars: Record<string, string>; mode: "light" | "dark" } {
  const mode = t.mode ?? "light";
  const def = THEMES[0]!;
  const base = mode === "light" ? def.vars : def.darkVars!;
  const vars: Record<string, string> = { ...base };
  if (t.background) vars["--bg"] = t.background;
  if (t.backgroundAlt) vars["--bg-2"] = t.backgroundAlt;
  if (t.surface) vars["--surface"] = rgb(t.surface);
  if (t.foreground) vars["--fg"] = t.foreground;
  if (t.muted) vars["--muted"] = t.muted;
  if (t.glowA) vars["--glow-a"] = t.glowA;
  if (t.glowB) vars["--glow-b"] = t.glowB;
  if (t.surfaceOpacity !== undefined) vars["--surface-a"] = String(t.surfaceOpacity);
  if (t.blur !== undefined) vars["--blur"] = `${t.blur}px`;
  return { vars, mode };
}

/** Perceived-contrast helper used to pick readable text on the accent colour. */
export function readableOn(hexColor: string): "#000000" | "#ffffff" {
  const n = parseInt(hexColor.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.45 ? "#000000" : "#ffffff";
}

/** Light-mode variable set: every built-in theme can render light (used when colour mode is "light" or the OS prefers light). */
const LIGHT_BASE = THEMES.find((t) => t.id === "liquid-glass")!.vars;
const DARK_FALLBACK = THEMES.find((t) => t.id === "liquid-glass")!.darkVars!;

function lightVariant(t: ThemeDef): Record<string, string> {
  if (t.mode === "light") return t.vars;
  return { ...LIGHT_BASE, "--glow-a": t.id === "aurora" ? "#d1fae5" : t.id === "amoled" ? "#ffffff" : "#dbeafe", "--glow-b": t.id === "aurora" ? "#ede9fe" : t.id === "amoled" ? "#ffffff" : "#e0f2fe" };
}

const block = (selector: string, vars: Record<string, string>) =>
  `${selector}{${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(";")}}`;

/**
 * Static stylesheet for all built-in themes. Generated from the THEMES data above, so the CSS is
 * ours (never user-supplied). Selected with <html data-theme="…" data-mode="light|dark">.
 */
export function themeStylesheet(): string {
  const out: string[] = [];
  for (const t of THEMES) {
    const dark = t.darkVars ?? (t.mode === "dark" ? t.vars : DARK_FALLBACK);
    out.push(block(`:root[data-theme="${t.id}"][data-mode="dark"]`, dark));
    out.push(block(`:root[data-theme="${t.id}"][data-mode="light"]`, lightVariant(t)));
  }
  return out.join("\n");
}
