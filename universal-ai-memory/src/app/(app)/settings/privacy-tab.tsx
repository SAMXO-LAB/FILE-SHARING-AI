"use client";
import { useState } from "react";
import { Lock, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/app/app-context";
import { Button } from "@/components/ui/button";
import { useDialogs } from "@/components/ui/confirm";
import { Badge } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/client/api";
import { PROCESSING_MODES, type ProcessingMode } from "@/lib/ai/privacy";
import type { Preferences } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Row, Section, ToggleRow } from "./parts";

export function PrivacyTab() {
  const { prefs, caps, updatePrefs } = useApp();
  const { confirm } = useDialogs();
  const [changedMode, setChangedMode] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const save = (patch: Partial<Preferences>) => void updatePrefs(patch).catch((e) => toast.error(errorMessage(e)));

  const unavailable = (id: ProcessingMode): string | null => {
    if (id === "local" && caps.aiLocality !== "local") return "This server has no self-hosted AI endpoint configured.";
    return null;
  };

  async function choose(id: ProcessingMode) {
    if (id === prefs.processing_mode || unavailable(id)) return;
    if (id === "cloud_ai") {
      const ok = await confirm({
        title: "Allow cloud AI?",
        description: caps.ai
          ? "Passages from your files and chats, document excerpts and your questions will be sent to the AI provider in readable form so it can write answers. Nothing here is end-to-end encrypted. You can switch back at any time; data the provider already received can't be recalled."
          : "No AI provider is configured on this server yet, so nothing would be sent right now. If one is added later, your content could be sent to it under this mode.",
        confirmLabel: "Allow cloud AI",
      });
      if (!ok) return;
    }
    try {
      await updatePrefs({ processing_mode: id, ...(id === "cloud_ai" ? { privacy_acknowledged: true } : {}) });
      setChangedMode(true);
      toast.success(`Privacy mode: ${PROCESSING_MODES.find((m) => m.id === id)?.label}`);
    } catch (e) { toast.error(errorMessage(e)); }
  }

  async function reindex() {
    if (!(await confirm({ title: "Re-process all files?", description: "Every file is read again using your current settings. This can take a while for large libraries, and files stay searchable meanwhile.", confirmLabel: "Re-process" }))) return;
    setReindexing(true);
    try { const r = await api<{ queued: number }>("/api/files/reindex-all", { body: {} }); toast.success(`Queued ${r.queued} file${r.queued === 1 ? "" : "s"}`); setChangedMode(false); } catch (e) { toast.error(errorMessage(e)); } finally { setReindexing(false); }
  }
  async function clearHistory() {
    if (!(await confirm({ title: "Clear search history?", description: "Your saved searches are deleted. Chats in Ask AI are kept; delete those from the chat's menu.", confirmLabel: "Clear", danger: true }))) return;
    try { await api("/api/search/history", { method: "DELETE" }); toast.success("Search history cleared"); } catch (e) { toast.error(errorMessage(e)); }
  }

  return (
    <div className="space-y-5">
      <Section title="What the app may do with your content" description="This decides whether your files and chats are read, and whether any of that text can leave this server.">
        <div role="radiogroup" aria-label="Privacy mode" className="space-y-2">
          {PROCESSING_MODES.map((m) => {
            const off = unavailable(m.id);
            const active = prefs.processing_mode === m.id;
            return (
              <button key={m.id} type="button" role="radio" aria-checked={active} disabled={Boolean(off)} onClick={() => void choose(m.id)}
                className={cn("block w-full rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55", active ? "border-accent bg-accent/10" : "hairline hover:bg-[rgb(var(--line)/0.06)]")}>
                <span className="flex flex-wrap items-center gap-2"><span className="font-medium">{m.label}</span>{active && <Badge tone="accent">Current</Badge>}{m.id === "extraction" && !active && <Badge>Default</Badge>}</span>
                <span className="mt-1 block text-sm">{m.summary}</span>
                <span className="mt-1 block text-xs text-muted">{off ?? m.detail}</span>
              </button>
            );
          })}
        </div>
        {changedMode && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent/5 p-3 text-sm">
            <span>The new mode applies to new content straight away. Re-process existing files so they follow it too.</span>
            <Button size="sm" variant="glass" loading={reindexing} onClick={() => void reindex()}><RefreshCw className="h-4 w-4" aria-hidden />Re-process files</Button>
          </div>
        )}
        <div className="flex gap-3 rounded-xl border hairline p-3 text-xs text-muted">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>Your files are stored privately and encrypted at rest by the storage provider, and only you (and people you explicitly share with) can open them. They are <strong className="text-fg">not end-to-end encrypted</strong>: the server has to read a file to search it, so the server operator and, in cloud AI mode, the AI provider can technically see the text they process.</p>
        </div>
      </Section>

      <Section title="Indexing">
        <ToggleRow id="semantic" label="Semantic search" description={caps.embeddings ? "Find items by meaning, not just matching words. Needs a mode that allows AI." : "Not available: no embedding model is configured on this server."} checked={prefs.semantic_indexing} onChange={(v) => save({ semantic_indexing: v })} disabled={!caps.embeddings} />
        <ToggleRow id="autocat" label="Automatic summaries and tags" description={caps.ai ? "Let AI add a short summary, topics and a category to new items. Needs a mode that allows AI." : "Not available: no AI provider is configured on this server."} checked={prefs.auto_categorize} onChange={(v) => save({ auto_categorize: v })} disabled={!caps.ai} />
        <Row label="Re-process existing files" description="Run extraction and indexing again with your current settings."><Button size="sm" variant="glass" loading={reindexing} onClick={() => void reindex()}><RefreshCw className="h-4 w-4" aria-hidden />Re-process</Button></Row>
      </Section>

      <Section title="Search history">
        <ToggleRow id="hist" label="Remember my searches" description="Used for suggestions on the My Memory page. Turning this off stops saving new searches." checked={prefs.save_search_history} onChange={(v) => save({ save_search_history: v })} />
        <Row label="Delete saved searches"><Button size="sm" variant="danger-ghost" onClick={() => void clearHistory()}>Clear history</Button></Row>
        <p className="flex gap-2 text-xs text-muted"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />Answers in Ask AI keep short quotes from the sources they cited, so you can reopen them later. They stay in that chat until you delete the chat.</p>
      </Section>
    </div>
  );
}
