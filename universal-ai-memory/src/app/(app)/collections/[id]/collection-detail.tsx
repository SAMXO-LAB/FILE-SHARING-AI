"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Download, Layers, Loader2, MessageSquare, MoreHorizontal, Pencil, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { AssistantBlock, type ChatMessage, type Structured } from "@/components/app/answer-block";
import { ResultCard } from "@/components/app/result-card";
import { Button } from "@/components/ui/button";
import { useDialogs } from "@/components/ui/confirm";
import { Input, Label, Textarea } from "@/components/ui/input";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/misc";
import { Dialog, DialogContent, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlay";
import { api, errorMessage, useFetch } from "@/lib/client/api";
import type { AskResult, ContentCard } from "@/lib/retrieval/types";

interface Detail { collection: { id: string; name: string; description: string | null; color: string | null }; cards: ContentCard[]; itemCount: number }

export function CollectionDetail({ id }: { id: string }) {
  const router = useRouter();
  const { confirm } = useDialogs();
  const detail = useFetch<Detail>(`/api/collections/${id}`);
  const reload = detail.reload;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [summary, setSummary] = useState<ChatMessage | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  useEffect(() => { const h = () => void reload(); window.addEventListener("memory:collections-changed", h); return () => window.removeEventListener("memory:collections-changed", h); }, [reload]);

  const c = detail.data?.collection;
  const cards = detail.data?.cards ?? [];

  async function save() {
    try {
      await api(`/api/collections/${id}`, { method: "PATCH", body: { name: name.trim(), description: description.trim() || null } });
      setEditing(false);
      void reload();
    } catch (e) { toast.error(errorMessage(e)); }
  }
  async function removeCollection() {
    if (!(await confirm({ title: "Delete this collection?", description: "Only the collection is deleted. The files, links and notes in it stay in your memory.", confirmLabel: "Delete collection", danger: true }))) return;
    try { await api(`/api/collections/${id}`, { method: "DELETE" }); router.replace("/collections"); } catch (e) { toast.error(errorMessage(e)); }
  }
  async function removeItem(card: ContentCard) {
    try {
      await api(`/api/collections/${id}/items?type=${card.type}&id=${card.id}`, { method: "DELETE" });
      void reload();
    } catch (e) { toast.error(errorMessage(e)); }
  }
  async function summarize() {
    setSummarizing(true);
    try {
      const r = await api<{ result: AskResult }>(`/api/collections/${id}/summarize`, { body: {} });
      const x = r.result;
      const structured: Structured = {
        mode: x.mode, citations: x.citations, sections: x.sections, suggestedActions: [], limitations: x.limitations, interpretation: x.interpretation, semantic: x.semantic,
      };
      setSummary({ id: `sum-${Date.now()}`, role: "assistant", content: x.answer, structured, cards: x.cards });
    } catch (e) { toast.error(errorMessage(e)); } finally { setSummarizing(false); }
  }

  if (detail.loading) return <div className="space-y-3"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-32" /></div>;
  if (detail.error || !c) return <ErrorState message={detail.error ?? "This collection doesn't exist."} onRetry={reload} />;

  return (
    <div>
      <Link href="/collections" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" aria-hidden />Collections</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl" style={{ background: `${c.color ?? "#6366f1"}26`, color: c.color ?? "#6366f1" }}><Layers className="h-6 w-6" aria-hidden /></span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{c.name}</h1>
            <p className="text-sm text-muted">{detail.data?.itemCount ?? 0} item{detail.data?.itemCount === 1 ? "" : "s"}{c.description ? ` · ${c.description}` : ""}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="glass" disabled={cards.length === 0 || summarizing} onClick={() => void summarize()}>{summarizing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}Summarize</Button>
          <Button asChild variant="glass" disabled={cards.length === 0}><Link href={`/ask?collection=${id}`}><MessageSquare className="h-4 w-4" aria-hidden />Ask about this collection</Link></Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Collection options"><MoreHorizontal className="h-5 w-5" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => { setName(c.name); setDescription(c.description ?? ""); setEditing(true); }}><Pencil className="h-4 w-4" aria-hidden />Rename or edit</DropdownMenuItem>
              <DropdownMenuItem asChild><a href={`/api/collections/${id}/export`} download><Download className="h-4 w-4" aria-hidden />Export index (Markdown)</a></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem danger onSelect={() => void removeCollection()}><Trash2 className="h-4 w-4" aria-hidden />Delete collection</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {summary && (
        <section className="mb-6" aria-label="Summary">
          <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold text-muted">Summary</h2><Button size="sm" variant="ghost" onClick={() => setSummary(null)}><X className="h-4 w-4" aria-hidden />Dismiss</Button></div>
          <AssistantBlock m={summary} onAsk={(t) => router.push(`/ask?q=${encodeURIComponent(t)}`)} onRefine={() => {}} />
        </section>
      )}

      {cards.length === 0 ? (
        <EmptyState icon={Layers} title="This collection is empty">Add items with the Collection button on a file or link, from an answer, or by dragging files from your computer onto this collection's card in the Collections list.</EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <li key={card.key} className="relative">
              <ResultCard card={card} />
              <Button size="icon-sm" variant="ghost" className="absolute right-2 top-2 z-10" aria-label={`Remove ${card.title} from this collection`} onClick={() => void removeItem(card)}><X className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent title="Edit collection">
          <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) void save(); }} className="space-y-4">
            <div><Label htmlFor="edit-col-name">Name</Label><Input id="edit-col-name" autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></div>
            <div><Label htmlFor="edit-col-desc">Description</Label><Textarea id="edit-col-desc" rows={2} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} /></div>
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button><Button type="submit" disabled={!name.trim()}>Save</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
