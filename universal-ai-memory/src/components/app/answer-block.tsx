"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Copy, FolderPlus, Info, NotebookPen, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/misc";
import { useDialogs } from "@/components/ui/confirm";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client/api";
import { formatDate } from "@/lib/utils";
import type { Citation, ContentCard } from "@/lib/retrieval/types";
import { AnswerText } from "./answer-text";
import { ResultCard } from "./result-card";

export interface Structured {
  mode?: "ai" | "extractive" | "general" | "none" | "clarify";
  citations?: Citation[];
  sections?: { key: string; label: string; cardKeys: string[] }[];
  suggestedActions?: { id: string; label: string; kind: "prompt" | "collection"; prompt?: string }[];
  limitations?: string[];
  interpretation?: { chips: { kind: "sender" | "date" | "type" | "source"; label: string }[]; intent: string };
  semantic?: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  structured?: Structured;
  cards?: ContentCard[];
  removedCards?: number;
  attachments?: { id: string; name: string }[];
  pending?: boolean;
  error?: string;
  /** For user messages: lets the "without this filter" chips re-run the question. */
  question?: string;
}

const MODE_LABEL: Record<string, { label: string; tone: "accent" | "neutral" | "warn" }> = {
  ai: { label: "Written by AI from your memory", tone: "accent" },
  extractive: { label: "Matching passages", tone: "neutral" },
  general: { label: "General knowledge, not from your files", tone: "warn" },
};

function citeHref(c: Citation) {
  return c.href;
}

export function AssistantBlock({ m, onAsk, onRefine }: { m: ChatMessage; onAsk: (text: string) => void; onRefine: (kind: "sender" | "date" | "type" | "source") => void }) {
  const router = useRouter();
  const { prompt } = useDialogs();
  const s = m.structured ?? {};
  const cites = s.citations ?? [];
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const cards = m.cards ?? [];
  const byKey = new Map(cards.map((c) => [c.key, c]));

  const scrollToCite = (n: number) => document.getElementById(`src-${m.id}-${n}`)?.scrollIntoView({ behavior: "smooth", block: "center" });

  async function copy() {
    try { await navigator.clipboard.writeText(m.content); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { toast.error("Couldn't copy to the clipboard"); }
  }
  async function saveNote() {
    try { await api(`/api/ask/messages/${m.id}/save-note`, { body: {} }); setSaved(true); toast.success("Saved as a note", { action: { label: "Open", onClick: () => router.push("/documents") } }); }
    catch (e) { toast.error("Couldn't save the note", { description: errorMessage(e) }); }
  }

  async function makeCollection() {
    const refs = cards.map((c) => ({ type: c.type, id: c.id }));
    if (refs.length === 0) return;
    const name = await prompt({ title: "Create a collection", label: "Name", initial: cards[0]?.title.slice(0, 60) ?? "", confirmLabel: "Create", maxLength: 80 });
    if (!name) return;
    try {
      const r = await api<{ collection: { id: string } }>("/api/collections", { body: { name } });
      await api(`/api/collections/${r.collection.id}/items`, { body: { items: refs } });
      toast.success(`Created “${name}” with ${refs.length} item${refs.length === 1 ? "" : "s"}`, { action: { label: "Open", onClick: () => router.push(`/collections/${r.collection.id}`) } });
    } catch (e) { toast.error("Couldn't create the collection", { description: errorMessage(e) }); }
  }

  const mode = s.mode ? MODE_LABEL[s.mode] : undefined;
  const chips = s.interpretation?.chips ?? [];

  return (
    <div className="space-y-4">
      <div className="glass p-5">
        {mode && <div className="mb-3 flex items-center gap-2"><Sparkles className="h-4 w-4 text-accent" aria-hidden /><Badge tone={mode.tone}>{mode.label}</Badge></div>}
        <AnswerText text={m.content} citations={cites.map((c) => c.n)} onCite={scrollToCite} />
        {chips.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="How I read your question">
            <span className="text-xs text-muted">Filters applied:</span>
            {chips.map((c) => (
              <span key={`${c.kind}-${c.label}`} className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 py-0.5 pl-2.5 pr-1 text-xs text-accent">
                {c.label}
                <button onClick={() => onRefine(c.kind)} className="grid h-4 w-4 place-items-center rounded-full hover:bg-accent/25" aria-label={`Search again without: ${c.label}`}><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        )}
        {(s.limitations?.length ?? 0) > 0 && (
          <ul className="mt-4 space-y-1.5" aria-label="Notes about this answer">
            {s.limitations!.map((l) => <li key={l} className="flex gap-2 text-xs text-muted"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{l}</li>)}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap gap-1 border-t hairline pt-3">
          <Button size="sm" variant="ghost" onClick={copy}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Copied" : "Copy"}</Button>
          <Button size="sm" variant="ghost" onClick={saveNote} disabled={saved}><NotebookPen className="h-4 w-4" />{saved ? "Saved" : "Save as note"}</Button>
        </div>
      </div>

      {cites.length > 0 && (
        <section aria-label="Sources" className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Sources</h3>
          <ol className="space-y-2">
            {cites.map((c) => (
              <li key={c.n} id={`src-${m.id}-${c.n}`} className="panel scroll-mt-24 p-3 text-sm">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-5 min-w-5 place-items-center rounded-md bg-accent/20 px-1 text-[11px] font-semibold text-accent">{c.n}</span>
                  <div className="min-w-0 flex-1">
                    <Link href={citeHref(c)} className="font-medium hover:underline">{c.title}</Link>
                    <p className="text-xs text-muted">
                      {c.sourceLabel}
                      {c.page != null && ` · page ${c.page}${c.pageEnd && c.pageEnd !== c.page ? `–${c.pageEnd}` : ""}`}
                      {c.conversationTitle && ` · ${c.conversationTitle}`}
                      {c.seqFrom != null && ` · messages ${c.seqFrom}${c.seqTo && c.seqTo !== c.seqFrom ? `–${c.seqTo}` : ""}`}
                      {c.timestamp && ` · ${formatDate(c.timestamp)}`}
                    </p>
                    <p className="mt-1.5 line-clamp-3 text-[13px] text-muted">“{c.passage}”</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {(s.sections?.length ?? 0) > 0 && cards.length > 0 && (
        <div className="space-y-4">
          {s.sections!.map((sec) => {
            const secCards = sec.cardKeys.map((k) => byKey.get(k)).filter((c): c is ContentCard => Boolean(c));
            if (secCards.length === 0) return null;
            return (
              <section key={sec.key} aria-label={sec.label}>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{sec.label} <span className="font-normal">({secCards.length})</span></h3>
                <div className="grid gap-3 sm:grid-cols-2">{secCards.map((c) => <ResultCard key={c.key} card={c} />)}</div>
              </section>
            );
          })}
        </div>
      )}
      {(m.removedCards ?? 0) > 0 && <p className="text-xs text-muted">{m.removedCards} item{m.removedCards === 1 ? "" : "s"} from this answer {m.removedCards === 1 ? "has" : "have"} since been deleted or is no longer available.</p>}

      {(s.suggestedActions?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Suggested next steps">
          {s.suggestedActions!.map((a) => (
            <button key={a.id} onClick={() => (a.kind === "collection" ? void makeCollection() : a.prompt && onAsk(a.prompt))} className="glass inline-flex items-center gap-1.5 px-3 py-1.5 text-sm !rounded-full hover:text-accent">
              {a.kind === "collection" ? <FolderPlus className="h-3.5 w-3.5" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}{a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
