"use client";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/app/app-context";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/client/api";
import { applyThemeToDom, themeFromPrefs } from "@/lib/theme-state";
import { customThemeSchema, THEMES, type CustomTheme } from "@/lib/themes";
import type { Preferences } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Row, Section, Segmented, ToggleRow } from "./parts";

const ACCENTS = ["#7c8cff", "#22d3ee", "#34d399", "#f59e0b", "#fb7185", "#c084fc", "#60a5fa", "#f472b6"];
type Tokens = CustomTheme["tokens"];

const FIELDS: { key: keyof Pick<Tokens, "background" | "backgroundAlt" | "surface" | "foreground" | "muted" | "glowA" | "glowB">; label: string; fallback: string }[] = [
  { key: "background", label: "Background", fallback: "#0a0f1f" }, { key: "backgroundAlt", label: "Background (second)", fallback: "#141b36" },
  { key: "surface", label: "Panel tint", fallback: "#ffffff" }, { key: "foreground", label: "Text", fallback: "#eef1ff" }, { key: "muted", label: "Secondary text", fallback: "#9aa4c7" },
  { key: "glowA", label: "Glow A", fallback: "#5b6cff" }, { key: "glowB", label: "Glow B", fallback: "#22d3ee" },
];

function ThemeCard({ id, label, description, colors, active, onSelect }: { id: string; label: string; description: string; colors: string[]; active: boolean; onSelect: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={active} onClick={onSelect} data-testid={`theme-${id}`} className={cn("relative rounded-xl border p-3 text-left transition-colors", active ? "border-accent ring-2 ring-accent/40" : "hairline hover:bg-[rgb(var(--line)/0.06)]")}>
      <span className="mb-2 flex h-14 overflow-hidden rounded-lg" aria-hidden>{colors.map((c, i) => <span key={i} className="flex-1" style={{ background: c }} />)}</span>
      <span className="block text-sm font-medium">{label}</span>
      <span className="block text-xs text-muted">{description}</span>
      {active && <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-accent text-[var(--accent-fg)]"><Check className="h-3 w-3" aria-hidden /></span>}
    </button>
  );
}

function CustomEditor() {
  const { prefs, customTokens, setCustomTokens, updatePrefs } = useApp();
  const [tokens, setTokens] = useState<Tokens>(() => (customTokens && typeof customTokens === "object" ? (customTokens as Tokens) : {}));
  const [busy, setBusy] = useState(false);

  // Live preview while editing: validated tokens only, applied as CSS variables.
  useEffect(() => { applyThemeToDom(themeFromPrefs({ ...prefs, theme: "custom" }, { tokens })); }, [tokens, prefs]);

  const set = <K extends keyof Tokens>(k: K, v: Tokens[K]) => setTokens((t) => ({ ...t, [k]: v }));
  async function save() {
    const parsed = customThemeSchema.safeParse({ name: "Custom", tokens });
    if (!parsed.success) { toast.error("Some colours aren't valid."); return; }
    setBusy(true);
    try {
      await api("/api/themes", { method: "PUT", body: parsed.data });
      setCustomTokens(parsed.data.tokens);
      await updatePrefs({ theme: "custom" });
      toast.success("Custom theme saved");
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  }
  return (
    <Section title="Custom theme" description="Pick your own colours. A theme is just a handful of colours and numbers; custom CSS or scripts aren't accepted.">
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key} className="flex items-center gap-3">
            <input id={`c-${f.key}`} type="color" value={tokens[f.key] ?? f.fallback} onChange={(e) => set(f.key, e.target.value)} className="h-9 w-12 cursor-pointer rounded-md border hairline bg-transparent p-0.5" />
            <Label htmlFor={`c-${f.key}`} className="!mb-0">{f.label}</Label>
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="c-op">Panel opacity ({tokens.surfaceOpacity === undefined ? "theme default" : `${Math.round(tokens.surfaceOpacity * 100)}%`})</Label><Input id="c-op" type="range" min={0.35} max={1} step={0.01} value={tokens.surfaceOpacity ?? 0.5} onChange={(e) => set("surfaceOpacity", Number(e.target.value))} className="px-0" /></div>
        <div><Label htmlFor="c-blur">Blur ({tokens.blur === undefined ? "theme default" : `${tokens.blur}px`})</Label><Input id="c-blur" type="range" min={0} max={40} step={1} value={tokens.blur ?? 22} onChange={(e) => set("blur", Number(e.target.value))} className="px-0" /></div>
      </div>
      <Row label="Base"><Segmented label="Base mode" value={tokens.mode ?? "dark"} onChange={(v) => set("mode", v)} options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }]} /></Row>
      <div className="flex gap-2"><Button loading={busy} onClick={() => void save()}>Save and use</Button><Button variant="ghost" onClick={() => setTokens({})}>Reset colours</Button></div>
    </Section>
  );
}

export function AppearanceTab() {
  const { prefs, updatePrefs, customTokens } = useApp();
  const save = (patch: Partial<Preferences>) => void updatePrefs(patch).catch((e) => toast.error(errorMessage(e)));
  const customColors = (() => { const t = (customTokens ?? {}) as Tokens; return [t.background ?? "#0a0f1f", t.glowA ?? "#5b6cff", t.glowB ?? "#22d3ee"]; })();

  return (
    <div className="space-y-5">
      <Section title="Theme" description="Changes apply immediately.">
        <div role="radiogroup" aria-label="Theme" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {THEMES.map((t) => <ThemeCard key={t.id} id={t.id} label={t.label} description={t.description} colors={t.preview} active={prefs.theme === t.id} onSelect={() => save({ theme: t.id })} />)}
          <ThemeCard id="custom" label="Custom" description="Your own colours (edit below)." colors={customColors} active={prefs.theme === "custom"} onSelect={() => save({ theme: "custom" })} />
        </div>
        <Row label="Light or dark" description={prefs.theme === "custom" ? "A custom theme sets its own base (see below)." : "“System” follows your device."}>
          <Segmented label="Colour mode" value={prefs.color_mode} onChange={(v) => save({ color_mode: v })} options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
        </Row>
      </Section>

      <Section title="Accent colour">
        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Accent colour">
          {ACCENTS.map((c) => <button key={c} type="button" role="radio" aria-checked={prefs.accent_color.toLowerCase() === c} aria-label={`Accent ${c}`} onClick={() => save({ accent_color: c })} className="grid h-8 w-8 place-items-center rounded-full ring-offset-2 ring-offset-[rgb(var(--bg))] aria-checked:ring-2" style={{ background: c, ["--tw-ring-color" as string]: c }}>{prefs.accent_color.toLowerCase() === c && <Check className="h-4 w-4 text-white mix-blend-difference" aria-hidden />}</button>)}
          <label htmlFor="accent-custom" className="ml-2 text-sm text-muted">Custom</label>
          <input id="accent-custom" type="color" value={prefs.accent_color} onChange={(e) => save({ accent_color: e.target.value })} className="h-8 w-10 cursor-pointer rounded-md border hairline bg-transparent p-0.5" />
        </div>
      </Section>

      <Section title="Layout and feel">
        <Row label="Background"><Segmented label="Background" value={prefs.background_style} onChange={(v) => save({ background_style: v })} options={[{ value: "gradient", label: "Gradient" }, { value: "mesh", label: "Mesh" }, { value: "solid", label: "Solid" }, { value: "none", label: "None" }]} /></Row>
        <Row label="Sidebar"><Segmented label="Sidebar style" value={prefs.sidebar_style} onChange={(v) => save({ sidebar_style: v })} options={[{ value: "glass", label: "Glass" }, { value: "solid", label: "Solid" }, { value: "minimal", label: "Minimal" }]} /></Row>
        <Row label="Corner radius"><Segmented label="Corner radius" value={prefs.border_radius} onChange={(v) => save({ border_radius: v })} options={[{ value: "sm", label: "Sharp" }, { value: "md", label: "Medium" }, { value: "lg", label: "Round" }, { value: "xl", label: "Extra round" }]} /></Row>
        <Row label="Chat bubbles"><Segmented label="Chat bubble style" value={prefs.chat_bubble_style} onChange={(v) => save({ chat_bubble_style: v })} options={[{ value: "soft", label: "Soft" }, { value: "outline", label: "Outline" }, { value: "flat", label: "Flat" }]} /></Row>
        <Row label="Animation" description="“None” turns motion off. Your device's reduce-motion setting is always respected."><Segmented label="Animation level" value={prefs.animation_level} onChange={(v) => save({ animation_level: v })} options={[{ value: "none", label: "None" }, { value: "subtle", label: "Subtle" }, { value: "normal", label: "Normal" }, { value: "rich", label: "Rich" }]} /></Row>
        <ToggleRow id="contrast" label="High contrast" description="Stronger borders and text for easier reading." checked={prefs.high_contrast} onChange={(v) => save({ high_contrast: v })} />
      </Section>

      {prefs.theme === "custom" && <CustomEditor />}
    </div>
  );
}
