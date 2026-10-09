import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanTags, escapeLike } from "@/lib/server/files";
import { parseUrlLines } from "@/lib/client/ingest";
import { themeFromPrefs } from "@/lib/theme-state";
import { customThemeSchema, readableOn, themeStylesheet, THEMES } from "@/lib/themes";
import { timeAgo } from "@/lib/utils";
import type { Preferences } from "@/lib/types";

const prefs: Pick<Preferences, "theme" | "color_mode" | "accent_color" | "background_style" | "sidebar_style" | "border_radius" | "chat_bubble_style" | "animation_level" | "high_contrast"> = {
  theme: "liquid-glass", color_mode: "system", accent_color: "#7c8cff", background_style: "gradient", sidebar_style: "glass", border_radius: "lg", chat_bubble_style: "soft", animation_level: "normal", high_contrast: false,
};

describe("cleanTags", () => {
  it("lowercases, trims, de-duplicates, strips control characters and caps length and count", () => {
    expect(cleanTags(["  Tax ", "tax", "TAX\u0000", "", "  "])).toEqual(["tax"]);
    expect(cleanTags(["x".repeat(100)])[0]).toHaveLength(40);
    expect(cleanTags(Array.from({ length: 50 }, (_, i) => `t${i}`))).toHaveLength(20);
  });
});

describe("escapeLike", () => {
  it("escapes LIKE wildcards so user input can't widen a match", () => {
    expect(escapeLike("100%_done\\")).toBe("100\\%\\_done\\\\");
    expect(escapeLike("plain")).toBe("plain");
  });
});

describe("parseUrlLines", () => {
  it("accepts a list of http(s) URLs and ignores blank and comment lines", () => {
    expect(parseUrlLines("https://a.example/x\n\n# note\nhttp://b.example")).toEqual(["https://a.example/x", "http://b.example"]);
  });
  it("refuses mixed text so ordinary notes are never mistaken for links", () => {
    expect(parseUrlLines("see https://a.example for details")).toBeNull();
    expect(parseUrlLines("https://a.example\nsome words")).toBeNull();
    expect(parseUrlLines("javascript:alert(1)")).toBeNull();
    expect(parseUrlLines("")).toBeNull();
  });
  it("refuses very long lists", () => {
    expect(parseUrlLines(Array.from({ length: 51 }, (_, i) => `https://a.example/${i}`).join("\n"))).toBeNull();
  });
});

describe("themes", () => {
  it("maps preferences to attributes and CSS variables", () => {
    const t = themeFromPrefs({ ...prefs, theme: "aurora", high_contrast: true, border_radius: "sm" });
    expect(t.attrs["data-theme"]).toBe("aurora");
    expect(t.attrs["data-contrast"]).toBe("high");
    expect(t.style["--radius"]).toBe("8px");
    expect(t.style["--accent"]).toBe("#2563eb");
  });
  it("treats the old purple default accent as the new blue default, but keeps a chosen accent", () => {
    expect(themeFromPrefs(prefs).style["--accent"]).toBe("#2563eb");
    expect(themeFromPrefs({ ...prefs, accent_color: "#16a34a" }).style["--accent"]).toBe("#16a34a");
  });
  it("renders the default theme light unless dark is chosen", () => {
    expect(themeFromPrefs(prefs).attrs["data-mode"]).toBe("light");
    expect(themeFromPrefs({ ...prefs, color_mode: "dark" }).attrs["data-mode"]).toBe("dark");
  });
  it("falls back to the default theme for an unknown theme id", () => {
    expect(themeFromPrefs({ ...prefs, theme: "nope" as never }).attrs["data-theme"]).toBe("liquid-glass");
  });
  it("applies a custom theme only from validated tokens", () => {
    const ok = themeFromPrefs({ ...prefs, theme: "custom" }, { tokens: { background: "#101010", mode: "light" } });
    expect(ok.attrs["data-theme"]).toBe("custom");
    expect(ok.attrs["data-mode"]).toBe("light");
    expect(ok.style["--bg"]).toBe("#101010");
    // Anything that isn't a plain hex colour is rejected, so no CSS can be smuggled in.
    const bad = themeFromPrefs({ ...prefs, theme: "custom" }, { tokens: { background: "red; background:url(//evil)" } });
    expect(bad.attrs["data-theme"]).toBe("liquid-glass");
    expect(JSON.stringify(bad.style)).not.toContain("evil");
  });
  it("rejects unknown keys and out-of-range numbers in custom themes", () => {
    expect(customThemeSchema.safeParse({ name: "x", tokens: { css: "body{}" } }).success).toBe(false);
    expect(customThemeSchema.safeParse({ name: "x", tokens: { blur: 400 } }).success).toBe(false);
    expect(customThemeSchema.safeParse({ name: "x", tokens: { accent: "#12345" } }).success).toBe(false);
  });
  it("picks readable text on light and dark accents", () => {
    expect(readableOn("#ffffff")).toBe("#000000");
    expect(readableOn("#101030")).toBe("#ffffff");
  });
  it("generates the built-in stylesheet from data only", () => {
    const css = themeStylesheet();
    for (const t of THEMES) expect(css).toContain(`data-theme="${t.id}"`);
    expect(css).not.toMatch(/url\(|@import|expression\(/i);
  });
});

describe("timeAgo", () => {
  afterEach(() => vi.useRealTimers());
  it("formats relative times", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-10T12:00:00Z"));
    expect(timeAgo("2026-06-10T11:59:50Z")).toBe("just now");
    expect(timeAgo("2026-06-10T11:58:00Z")).toBe("2 minutes ago");
    expect(timeAgo("2026-06-10T11:00:00Z")).toBe("1 hour ago");
    expect(timeAgo("2026-06-08T12:00:00Z")).toBe("2 days ago");
    expect(timeAgo(null)).toBe("");
    expect(timeAgo("not a date")).toBe("");
  });
});
