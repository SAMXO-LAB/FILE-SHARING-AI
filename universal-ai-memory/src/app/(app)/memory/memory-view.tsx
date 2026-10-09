"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Clock, History, Loader2, Search, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { ResultCard } from "@/components/app/result-card";
import { TimelineList, type TimelineItem } from "@/components/app/timeline-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { api, errorMessage, useFetch } from "@/lib/client/api";
import type { ContentCard } from "@/lib/retrieval/types";
import { cn } from "@/lib/utils";

type Category = "document" | "image" | "audio" | "video" | "data" | "code" | "archive" | "other";
type SourceId = "upload" | "whatsapp" | "telegram" | "link" | "note" | "ai_chat";
const CATEGORIES: { id: Category; label: string }[] = [
  { id: "document", label: "Documents" }, { id: "image", label: "Images" }, { id: "video", label: "Videos" }, { id: "audio", label: "Audio" }, { id: "data", label: "Data" }, { id: "code", label: "Code" }, { id: "archive", label: "Archives" },
];
const SOURCES: { id: SourceId; label: string }[] = [
  { id: "upload", label: "Uploads" }, { id: "whatsapp", label: "WhatsApp" }, { id: "telegram", label: "Telegram" }, { id: "link", label: "Links" }, { id: "note", label: "Notes" },
];

interface SearchResult { cards: ContentCard[]; sections: { key: string; label: string; cardKeys: string[] }[]; chips: { kind: string; label: string }[]; semantic: boolean; limitations: string[]; browse: boolean }
interface TimelineData { items: TimelineItem[]; nextBefore: string | null }

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={on} onClick={onClick} className={cn("rounded-full border px-3 py-1 text-sm transition-colors", on ? "border-accent bg-accent/15 text-accent" : "border-line text-muted hover:text-fg")}>{children}</button>;
}

function SearchTab() {
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get("q") ?? "";
  const [q, setQ] = useState(initial);
  const [committed, setCommitted] = useState(initial);
  const [cats, setCats] = useState<Category[]>([]);
  const [sources, setSources] = useState<SourceId[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dropped, setDropped] = useState<("sender" | "date" | "type" | "source")[]>([]);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const seq = useRef(0);
  const history = useFetch<{ history: { id: string; query: string }[] }>("/api/search/history");

  // Debounced typing; Enter commits immediately and records the query in history.
  useEffect(() => { const t = setTimeout(() => setCommitted(q.trim()), 350); return () => clearTimeout(t); }, [q]);

  useEffect(() => {
    const mine = ++seq.current;
    setLoading(true);
    const filters = {
      ...(cats.length ? { categories: cats } : {}), ...(sources.length ? { sourceIds: sources } : {}),
      ...(from ? { from: new Date(`${from}T00:00:00`).toISOString() } : {}), ...(to ? { to: new Date(`${to}T23:59:59`).toISOString() } : {}),
      ...(dropped.length ? { dropped } : {}),
    };
    api<SearchResult>("/api/search", { body: { q: committed, filters: Object.keys(filters).length ? filters : undefined, tzOffsetMinutes: new Date().getTimezoneOffset() } })
      .then((r) => { if (mine === seq.current) { setResult(r); setError(null); } })
      .catch((e) => { if (mine === seq.current) setError(errorMessage(e)); })
      .finally(() => { if (mine === seq.current) setLoading(false); });
  }, [committed, cats, sources, from, to, dropped, nonce]);

  function submit() {
    const t = q.trim();
    setCommitted(t);
    router.replace(t ? `/memory?q=${encodeURIComponent(t)}` : "/memory", { scroll: false });
    if (t) void api("/api/search", { body: { q: t, limit: 1, record: true } }).then(() => history.reload()).catch(() => {});
  }
  async function clearHistory() {
    try { await api("/api/search/history", { method: "DELETE" }); void history.reload(); toast.success("Search history cleared"); } catch (e) { toast.error(errorMessage(e)); }
  }
  const toggle = <T,>(list: T[], set: (v: T[]) => void, v: T) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const filtered = cats.length > 0 || sources.length > 0 || Boolean(from) || Boolean(to);
  const cards = result?.cards ?? [];
  const byKey = new Map(cards.map((c) => [c.key, c]));

  return (
    <div className="space-y-4">
      <form role="search" onSubmit={(e) => { e.preventDefault(); submit(); }} className="glass glass-strong flex items-center gap-2 p-2 !rounded-[calc(var(--radius)*1.2)]">
        <Search className="ml-2 h-5 w-5 shrink-0 text-muted" aria-hidden />
        <label htmlFor="mem-q" className="sr-only">Search your memory</label>
        <Input id="mem-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search files, links, notes and chats…" className="border-0 bg-transparent shadow-none focus-visible:ring-0" autoComplete="off" />
        {q && <Button type="button" size="icon-sm" variant="ghost" aria-label="Clear search" onClick={() => { setQ(""); setCommitted(""); router.replace("/memory", { scroll: false }); }}><X className="h-4 w-4" /></Button>}
        <Button type="submit"><Search className="h-4 w-4" aria-hidden />Search</Button>
      </form>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
        {CATEGORIES.map((c) => <Toggle key={c.id} on={cats.includes(c.id)} onClick={() => toggle(cats, setCats, c.id)}>{c.label}</Toggle>)}
        <span className="mx-1 hidden h-5 w-px bg-[rgb(var(--line)/0.3)] sm:block" aria-hidden />
        {SOURCES.map((s) => <Toggle key={s.id} on={sources.includes(s.id)} onClick={() => toggle(sources, setSources, s.id)}>{s.label}</Toggle>)}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <label htmlFor="mem-from">From</label><Input id="mem-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-9 w-auto" />
        <label htmlFor="mem-to">to</label><Input id="mem-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-9 w-auto" />
        {(filtered || dropped.length > 0) && <Button size="sm" variant="ghost" onClick={() => { setCats([]); setSources([]); setFrom(""); setTo(""); setDropped([]); }}>Clear filters</Button>}
      </div>

      {!committed && !filtered && history.data && history.data.history.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm"><History className="h-4 w-4 text-muted" aria-hidden />
          {history.data.history.slice(0, 8).map((h) => <button key={h.id} className="rounded-full border border-line px-2.5 py-0.5 text-muted hover:text-fg" onClick={() => { setQ(h.query); setCommitted(h.query); }}>{h.query}</button>)}
          <button className="text-xs text-muted underline" onClick={() => void clearHistory()}>Clear history</button>
        </div>
      )}

      {result && result.chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted" aria-label="How your search was read">
          <span>Understood as:</span>
          {result.chips.map((c) => (
            <Badge key={`${c.kind}:${c.label}`} tone="accent">{c.label}{["sender", "date", "type", "source"].includes(c.kind) && <button aria-label={`Ignore “${c.label}”`} className="ml-0.5" onClick={() => setDropped((d) => [...new Set([...d, c.kind as "sender"])])}><X className="h-3 w-3" /></button>}</Badge>
          ))}
        </div>
      )}
      {result?.limitations.map((l) => <p key={l} className="text-xs text-muted">{l}</p>)}

      <div aria-live="polite" aria-busy={loading}>
        {error ? <ErrorState message={error} onRetry={() => setNonce((n) => n + 1)} />
          : loading && !result ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-32" />)}</div>
          : cards.length === 0 ? (
            result?.browse && !filtered ? <EmptyState icon={Sparkles} title="Your memory is empty" action={<Button asChild><Link href="/uploads">Add something</Link></Button>}>Add files, links, notes or chat exports, then search them here.</EmptyState>
            : <EmptyState icon={Search} title="Nothing matched">Try fewer or different words{result?.chips.length || filtered ? ", or remove a filter" : ""}. Searches look in file names, extracted text, links, notes and imported chats.</EmptyState>
          ) : (
            <div className={cn("space-y-6", loading && "opacity-60 transition-opacity")}>
              <p className="flex items-center gap-2 text-sm text-muted">{loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{result?.browse ? "Most recent items" : `${cards.length} result${cards.length === 1 ? "" : "s"}`}{!result?.semantic && !result?.browse && " · keyword search"}</p>
              {(result?.sections.length ? result.sections : [{ key: "all", label: "", cardKeys: cards.map((c) => c.key) }]).map((s) => (
                <section key={s.key} aria-label={s.label || "Results"}>
                  {s.label && <h2 className="mb-2 text-sm font-semibold text-muted">{s.label}</h2>}
                  <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{s.cardKeys.map((k) => byKey.get(k)).filter((c): c is ContentCard => Boolean(c)).map((c) => <li key={c.key}><ResultCard card={c} /></li>)}</ul>
                </section>
              ))}
              {committed && <p className="text-center text-sm text-muted">Want a written answer? <Link href={`/ask?q=${encodeURIComponent(committed)}`} className="text-accent underline">Ask AI about “{committed}”</Link></p>}
            </div>
          )}
      </div>
    </div>
  );
}

function TimelineTab() {
  const first = useFetch<TimelineData>("/api/timeline?limit=40");
  const [more, setMore] = useState<TimelineItem[]>([]);
  const [next, setNext] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const cursor = next === undefined ? first.data?.nextBefore ?? null : next;
  const items = [...(first.data?.items ?? []), ...more];

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const r = await api<TimelineData>(`/api/timeline?limit=40&before=${encodeURIComponent(cursor)}`);
      setMore((m) => [...m, ...r.items]);
      setNext(r.nextBefore);
    } catch (e) { toast.error(errorMessage(e)); } finally { setLoadingMore(false); }
  }

  if (first.loading) return <div className="space-y-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div>;
  if (first.error) return <ErrorState message={first.error} onRetry={first.reload} />;
  if (items.length === 0) return <EmptyState icon={Clock} title="Nothing on the timeline yet">Items appear here, newest first, as you add them. Dates are when something was added to your memory; an item's original date is shown when we know it.</EmptyState>;
  return (
    <div className="space-y-5">
      <TimelineList items={items} />
      {cursor && <div className="text-center"><Button variant="glass" loading={loadingMore} onClick={() => void loadMore()}>Show older</Button></div>}
    </div>
  );
}

export function MemoryView() {
  const [tab, setTab] = useState("search");
  return (
    <div>
      <PageHeader title="My Memory" description="Search everything you've added, or browse it by date." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Memory views">
          <TabsTrigger value="search"><Search className="h-4 w-4" aria-hidden />Search</TabsTrigger>
          <TabsTrigger value="timeline"><Clock className="h-4 w-4" aria-hidden />Timeline</TabsTrigger>
        </TabsList>
        <TabsContent value="search"><SearchTab /></TabsContent>
        <TabsContent value="timeline"><TimelineTab /></TabsContent>
      </Tabs>
    </div>
  );
}
