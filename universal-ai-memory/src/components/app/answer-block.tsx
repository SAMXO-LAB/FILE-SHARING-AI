"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Copy, FileText, FolderPlus, Info, NotebookPen, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { useDialogs } from "@/components/ui/confirm";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client/api";
import { cn, formatDate } from "@/lib/utils";
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
    <div className="space-y-7 animate-rise">
      <article className="card overflow-hidden !rounded-[calc(var(--radius)*1.2)] shadow-[var(--shadow-sm)]">
        <div className="px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
          {mode && (
            <div className="mb-3.5 flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-accent-soft text-accent"><Sparkles className="h-3.5 w-3.5" aria-hidden /></span>
              <span className={cn("text-[12.5px] font-medium", mode.tone === "warn" ? "text-warn" : "text-muted")}>{mode.label}</span>
            </div>
          )}
          <AnswerText text={m.content} citations={cites.map((c) => c.n)} onCite={scrollToCite} />
          {chips.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-1.5" aria-label="How I read your question">
              <span className="mr-0.5 text-xs text-muted">Filters applied</span>
              {chips.map((c) => (
                <span key={`${c.kind}-${c.label}`} className="inline-flex items-center gap-1 rounded-full border border-accent/20 bg-accent-soft py-0.5 pl-2.5 pr-1 text-xs font-medium text-accent">
                  {c.label}
                  <button onClick={() => onRefine(c.kind)} className="grid h-4 w-4 place-items-center rounded-full transition-colors hover:bg-accent/15" aria-label={`Search again without: ${c.label}`}><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          )}
          {(s.limitations?.length ?? 0) > 0 && (
            <ul className="mt-4 space-y-1.5 rounded-xl bg-[rgb(var(--line)/0.03)] px-3 py-2.5" aria-label="Notes about this answer">
              {s.limitations!.map((l) => <li key={l} className="flex gap-2 text-[12.5px] leading-relaxed text-muted"><Info className="mt-[3px] h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />{l}</li>)}
            </ul>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1 border-t hairline bg-[rgb(var(--line)/0.02)] px-3 py-2 sm:px-4">
          <Button size="sm" variant="ghost" className="text-muted hover:text-fg" onClick={copy} aria-live="polite">{copied ? <Check className="h-4 w-4 text-ok" /> : <Copy className="h-4 w-4" />}{copied ? "Copied" : "Copy"}</Button>
          <Button size="sm" variant="ghost" className="text-muted hover:text-fg" onClick={saveNote} disabled={saved}>{saved ? <Check className="h-4 w-4 text-ok" /> : <NotebookPen className="h-4 w-4" />}{saved ? "Saved to notes" : "Save as note"}</Button>
          {cites.length > 0 && <span className="ml-auto pr-1 text-xs text-subtle">{cites.length} source{cites.length === 1 ? "" : "s"}</span>}
        </div>
      </article>

      {cites.length > 0 && (
        <section aria-label="Sources">
          <h3 className="eyebrow mb-2.5">Sources</h3>
          <ol className="grid gap-2">
            {cites.map((c) => <SourceItem key={c.n} c={c} anchorId={`src-${m.id}-${c.n}`} />)}
          </ol>
        </section>
      )}

      {(s.sections?.length ?? 0) > 0 && cards.length > 0 && (
        <div className="space-y-6">
          {s.sections!.map((sec) => {
            const secCards = sec.cardKeys.map((k) => byKey.get(k)).filter((c): c is ContentCard => Boolean(c));
            if (secCards.length === 0) return null;
            return <CardSection key={sec.key} label={sec.label} cards={secCards} />;
          })}
        </div>
      )}
      {(m.removedCards ?? 0) > 0 && <p className="text-xs text-muted">{m.removedCards} item{m.removedCards === 1 ? "" : "s"} from this answer {m.removedCards === 1 ? "has" : "have"} since been deleted or is no longer available.</p>}

      {(s.suggestedActions?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Suggested next steps">
          {s.suggestedActions!.map((a) => (
            <button key={a.id} onClick={() => (a.kind === "collection" ? void makeCollection() : a.prompt && onAsk(a.prompt))} className="inline-flex h-8 items-center gap-1.5 rounded-full border hairline bg-card px-3 text-[13px] text-fg shadow-[var(--shadow-xs)] transition-colors hover:border-accent/30 hover:text-accent">
              {a.kind === "collection" ? <FolderPlus className="h-3.5 w-3.5 text-accent" aria-hidden /> : <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden />}{a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const SECTION_PREVIEW = 6;

/** A labelled group of real result cards; long groups show the first few with a "Show all" toggle. */
function CardSection({ label, cards }: { label: string; cards: ContentCard[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? cards : cards.slice(0, SECTION_PREVIEW);
  return (
    <section aria-label={label}>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h3 className="eyebrow">{label} <span className="font-normal normal-case tracking-normal text-subtle">({cards.length})</span></h3>
        {cards.length > SECTION_PREVIEW && (
          <button type="button" onClick={() => setAll((v) => !v)} className="text-[13px] font-medium text-accent hover:underline">{all ? "Show fewer" : `View all ${cards.length}`}</button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{shown.map((c) => <ResultCard key={c.key} card={c} />)}</div>
    </section>
  );
}

/** One cited passage. Long excerpts are clamped with an explicit expand control. */
function SourceItem({ c, anchorId }: { c: Citation; anchorId: string }) {
  const [open, setOpen] = useState(false);
  const long = c.passage.length > 220;
  const meta = [
    c.sourceLabel,
    c.page != null ? `page ${c.page}${c.pageEnd && c.pageEnd !== c.page ? `–${c.pageEnd}` : ""}` : null,
    c.conversationTitle,
    c.seqFrom != null ? `messages ${c.seqFrom}${c.seqTo && c.seqTo !== c.seqFrom ? `–${c.seqTo}` : ""}` : null,
    c.timestamp ? formatDate(c.timestamp) : null,
  ].filter(Boolean).join(" · ");
  return (
    <li id={anchorId} className="card card-hover scroll-mt-28 px-4 py-3.5 target:border-accent">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-[22px] min-w-[22px] place-items-center rounded-[7px] border border-accent/20 bg-accent-soft px-1 text-[11px] font-semibold text-accent">{c.n}</span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <FileText className="relative top-0.5 h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
            <Link href={citeHref(c)} className="min-w-0 truncate text-[14px] font-medium hover:text-accent hover:underline">{c.title}</Link>
          </div>
          {meta && <p className="mt-0.5 truncate text-xs text-muted">{meta}</p>}
          <p className={cn("mt-2 text-[13.5px] leading-relaxed text-muted", !open && "line-clamp-3")}>“{c.passage}”</p>
          {long && <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-1 text-xs font-medium text-accent hover:underline">{open ? "Show less" : "Show more"}</button>}
        </div>
      </div>
    </li>
  );
}
