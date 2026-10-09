"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ExternalLink, Layers, Link2, Plus, RefreshCw, Search, Sparkles, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAddToMemory } from "@/components/app/add-dialog";
import { StatusBadge } from "@/components/app/file-visuals";
import { CollectionPicker } from "@/components/app/pickers";
import { Button } from "@/components/ui/button";
import { useDialogs } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui/misc";
import { api, errorMessage, useFetch } from "@/lib/client/api";
import { cn, formatDate } from "@/lib/utils";
import type { LinkRow } from "@/lib/types";

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

export function LinksView() {
  const { openAdd } = useAddToMemory();
  const { confirm } = useDialogs();
  const params = useSearchParams();
  const openId = params.get("open");
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [starred, setStarred] = useState(false);
  const [colFor, setColFor] = useState<string | null>(null);
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const list = useFetch<{ links: LinkRow[]; total: number }>(`/api/links?limit=100${dq ? `&q=${encodeURIComponent(dq)}` : ""}${starred ? "&starred=1" : ""}`);
  const reload = list.reload;
  useEffect(() => { const h = () => void reload(); window.addEventListener("memory:links-changed", h); return () => window.removeEventListener("memory:links-changed", h); }, [reload]);
  const pending = list.data?.links.some((l) => l.status === "queued" || l.status === "fetching");
  useEffect(() => { if (!pending) return; const t = setInterval(() => void reload(), 4000); return () => clearInterval(t); }, [pending, reload]);
  useEffect(() => { if (openId && list.data) document.getElementById(`link-${openId}`)?.scrollIntoView({ block: "center" }); }, [openId, list.data]);

  async function remove(l: LinkRow) {
    if (!(await confirm({ title: "Delete this link?", description: "It's removed from your memory along with the page text we saved.", confirmLabel: "Delete", danger: true }))) return;
    try { await api(`/api/links/${l.id}`, { method: "DELETE" }); void reload(); } catch (e) { toast.error(errorMessage(e)); }
  }
  async function star(l: LinkRow) {
    try { await api(`/api/links/${l.id}`, { method: "PATCH", body: { starred: !l.starred } }); void reload(); } catch (e) { toast.error(errorMessage(e)); }
  }
  async function retry(l: LinkRow) {
    try { await api(`/api/links/${l.id}/retry`, { body: {} }); toast.success("Trying again"); void reload(); } catch (e) { toast.error(errorMessage(e)); }
  }

  const links = list.data?.links ?? [];
  return (
    <div>
      <PageHeader title="Saved Links" description="Pages you've saved. We keep their text so you can search them later, even if the page changes or disappears." actions={<Button onClick={() => openAdd("link")}><Plus className="h-4 w-4" aria-hidden />Save a link</Button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-52 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden /><label htmlFor="link-search" className="sr-only">Search saved links</label><Input id="link-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search saved links…" className="pl-9" /></div>
        <Button variant={starred ? "primary" : "glass"} aria-pressed={starred} onClick={() => setStarred((s) => !s)}><Star className="h-4 w-4" aria-hidden />Starred</Button>
      </div>
      {list.loading ? <div className="space-y-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>
        : list.error ? <ErrorState message={list.error} onRetry={reload} />
        : links.length === 0 ? <EmptyState icon={Link2} title={dq || starred ? "No links match" : "No saved links yet"} action={!dq && !starred ? <Button onClick={() => openAdd("link")}><Plus className="h-4 w-4" aria-hidden />Save a link</Button> : undefined}>{dq || starred ? "Try different words or clear the filter." : "Paste a web address, or drag a link from your browser anywhere onto this page."}</EmptyState>
        : (
          <ul className="space-y-3">
            {links.map((l) => (
              <li key={l.id} id={`link-${l.id}`} className={cn("glass p-4", l.id === openId && "ring-2 ring-accent")}>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-50 dark:bg-cyan-500/12 text-cyan-700 dark:text-cyan-300"><Link2 className="h-5 w-5" aria-hidden /></span>
                  <div className="min-w-0 flex-1">
                    <a href={l.final_url ?? l.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 font-medium hover:underline"><span className="truncate">{l.title ?? l.url}</span><ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden /></a>
                    <p className="truncate text-xs text-muted">{l.site_name ?? host(l.url)} · saved {formatDate(l.created_at)}</p>
                    {l.summary ? <p className="mt-2 text-sm text-muted"><Sparkles className="mr-1 inline h-3.5 w-3.5 text-accent" aria-label="AI summary" />{l.summary}</p> : l.description ? <p className="mt-2 line-clamp-2 text-sm text-muted">{l.description}</p> : null}
                    {l.status === "failed" && <p className="mt-2 text-sm text-danger">{l.status_detail ?? "We couldn't fetch this page."}</p>}
                    {l.status === "ready" && l.status_detail && <p className="mt-2 text-xs text-muted">{l.status_detail}</p>}
                  </div>
                  <StatusBadge status={l.status} detail={l.status_detail} />
                </div>
                <div className="mt-3 flex flex-wrap gap-1 border-t hairline pt-2">
                  <Button size="sm" variant="ghost" onClick={() => void star(l)} aria-pressed={l.starred}><Star className={cn("h-4 w-4", l.starred && "fill-current text-warn")} aria-hidden />{l.starred ? "Starred" : "Star"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setColFor(l.id)}><Layers className="h-4 w-4" aria-hidden />Collection</Button>
                  {l.status === "failed" && <Button size="sm" variant="ghost" onClick={() => void retry(l)}><RefreshCw className="h-4 w-4" aria-hidden />Try again</Button>}
                  <Button size="sm" variant="danger-ghost" className="ml-auto" onClick={() => void remove(l)}><Trash2 className="h-4 w-4" aria-hidden />Delete</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      <CollectionPicker open={colFor !== null} onOpenChange={(o) => { if (!o) setColFor(null); }} items={colFor ? [{ type: "link", id: colFor }] : []} />
    </div>
  );
}
