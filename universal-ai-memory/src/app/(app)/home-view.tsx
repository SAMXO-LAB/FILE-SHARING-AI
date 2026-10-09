"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowUp, FileUp, ImageIcon, Files, FileText, Layers, Link2, Loader2, MessagesSquare, NotebookPen, Send, Sparkles, Users } from "lucide-react";
import { useAddToMemory } from "@/components/app/add-dialog";
import { useApp } from "@/components/app/app-context";
import { TimelineList, type TimelineItem } from "@/components/app/timeline-list";
import { Button } from "@/components/ui/button";
import { EmptyState, Progress, Skeleton } from "@/components/ui/misc";
import { useFetch } from "@/lib/client/api";
import { humanSize } from "@/lib/files/types";

interface Counts { files: number; images: number; videos: number; documents: number; pdfs: number; links: number; notes: number; conversations: number; collections: number; processing: number; failed: number; pendingShares: number }
interface Home { counts: Counts; total: number; ai: boolean }

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function HomeView() {
  const { profile, caps, prefs } = useApp();
  const router = useRouter();
  const { openAdd } = useAddToMemory();
  const home = useFetch<Home>("/api/home");
  const recent = useFetch<{ items: TimelineItem[] }>("/api/timeline?limit=8");
  const storage = useFetch<{ usedBytes: number; quotaBytes: number }>("/api/storage");
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  useEffect(() => { /* greeting depends on the visitor's clock */ setName(`${greeting()}, ${profile.display_name?.split(" ")[0] || profile.username}`); }, [profile]);

  const c = home.data?.counts;
  const empty = home.data && home.data.total === 0;

  const suggestions: string[] = [];
  if (c && home.data!.total > 0) {
    suggestions.push("What did I add this week?");
    if (c.pdfs > 0) suggestions.push("Find my PDFs");
    if (c.images > 0) suggestions.push("Show my recent photos");
    if (c.links > 0) suggestions.push("Show links I saved recently");
    if (c.conversations > 0) suggestions.push("Find messages from last month");
    if (c.files > 1) suggestions.push("Find duplicate files");
  }

  const go = (text: string) => { const v = text.trim(); if (v) router.push(`/ask?q=${encodeURIComponent(v)}`); };

  const tiles = c ? [
    { href: "/files", label: "Files", n: c.files, icon: Files },
    { href: "/media", label: "Images & videos", n: c.images + c.videos, icon: ImageIcon },
    { href: "/documents", label: "Documents", n: c.documents, icon: FileText },
    { href: "/links", label: "Saved links", n: c.links, icon: Link2 },
    { href: "/conversations", label: "Conversations", n: c.conversations, icon: MessagesSquare },
    { href: "/collections", label: "Collections", n: c.collections, icon: Layers },
  ] : [];

  return (
    <div className="space-y-8">
      <section className="pt-2 text-center sm:pt-6">
        <p className="text-sm text-muted min-h-5">{name}</p>
        <h1 className="mx-auto mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">What would you like to find?</h1>
        <form onSubmit={(e) => { e.preventDefault(); go(q); }} className="glass glass-strong mx-auto mt-6 flex max-w-2xl items-center gap-2 p-2 pl-4 !rounded-[calc(var(--radius)*1.3)]" role="search">
          <Sparkles className="h-5 w-5 shrink-0 text-accent" aria-hidden />
          <label htmlFor="home-ask" className="sr-only">Ask about your files, chats, links and notes</label>
          <input id="home-ask" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask anything about your digital life..." maxLength={4000} autoComplete="off" className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted/80" />
          <Button type="submit" size="icon" aria-label="Ask" disabled={!q.trim()}><ArrowUp className="h-5 w-5" /></Button>
        </form>
        {suggestions.length > 0 && (
          <div className="mx-auto mt-4 flex max-w-2xl flex-wrap justify-center gap-2" aria-label="Suggestions">
            {suggestions.map((s) => <button key={s} onClick={() => go(s)} className="glass px-3.5 py-1.5 text-sm text-muted transition-colors hover:text-fg !rounded-full">{s}</button>)}
          </div>
        )}
        {!caps.ai && <p className="mx-auto mt-4 max-w-xl text-xs text-muted">No AI provider is configured on this server, so you'll get matching passages and files instead of written answers.</p>}
        {caps.ai && prefs.processing_mode !== "cloud_ai" && prefs.processing_mode !== "local" && <p className="mx-auto mt-4 max-w-xl text-xs text-muted">Your privacy mode keeps content away from AI providers, so answers list matching passages. <Link className="underline" href="/settings?tab=privacy">Change in Settings</Link></p>}
      </section>

      {home.loading && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>}

      {c && (c.processing > 0 || c.failed > 0 || c.pendingShares > 0) && (
        <section className="space-y-2" aria-label="Notices">
          {c.processing > 0 && <Link href="/uploads" className="panel flex items-center gap-3 p-3 text-sm"><Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden />{c.processing} file{c.processing === 1 ? " is" : "s are"} being processed. They'll become searchable when done.</Link>}
          {c.failed > 0 && <Link href="/uploads" className="panel flex items-center gap-3 border-danger/40 p-3 text-sm"><AlertTriangle className="h-4 w-4 text-danger" aria-hidden />{c.failed} file{c.failed === 1 ? "" : "s"} couldn't be read. See why and retry.</Link>}
          {c.pendingShares > 0 && <Link href="/files?view=shared" className="panel flex items-center gap-3 p-3 text-sm"><Users className="h-4 w-4 text-accent" aria-hidden />{c.pendingShares} file{c.pendingShares === 1 ? "" : "s"} shared with you {c.pendingShares === 1 ? "is" : "are"} waiting for your answer.</Link>}
        </section>
      )}

      {empty ? (
        <section aria-label="Get started">
          <EmptyState icon={Sparkles} title="Your memory is empty. Let's fill it.">Add something, then ask about it here. Nothing is shown until you add it yourself.</EmptyState>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <button onClick={() => openAdd("files")} className="glass flex flex-col items-start gap-2 p-5 text-left transition-transform hover:-translate-y-0.5"><FileUp className="h-6 w-6 text-accent" aria-hidden /><span className="font-medium">Upload files</span><span className="text-sm text-muted">PDFs, documents, photos, audio, video. Drag them anywhere.</span></button>
            <button onClick={() => openAdd("link")} className="glass flex flex-col items-start gap-2 p-5 text-left transition-transform hover:-translate-y-0.5"><Link2 className="h-6 w-6 text-accent" aria-hidden /><span className="font-medium">Save a link</span><span className="text-sm text-muted">Articles and pages you want to find again.</span></button>
            <button onClick={() => openAdd("import")} className="glass flex flex-col items-start gap-2 p-5 text-left transition-transform hover:-translate-y-0.5"><MessagesSquare className="h-6 w-6 text-accent" aria-hidden /><span className="font-medium">Import a chat</span><span className="text-sm text-muted">Bring in a WhatsApp or Telegram export you made yourself.</span></button>
          </div>
          <p className="mt-4 flex items-center gap-2 text-sm text-muted"><Send className="h-4 w-4" aria-hidden />Prefer Telegram? <Link className="text-accent underline underline-offset-4" href="/integrations">Link the bot</Link> and just send things to it.</p>
        </section>
      ) : c && (
        <>
          <section aria-label="Your memory at a glance" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {tiles.map((t) => (
              <Link key={t.href} href={t.href} className="glass flex flex-col gap-3 p-4 transition-transform hover:-translate-y-0.5">
                <t.icon className="h-5 w-5 text-accent" aria-hidden />
                <div><p className="text-2xl font-semibold tabular-nums">{t.n.toLocaleString()}</p><p className="text-xs text-muted">{t.label}</p></div>
              </Link>
            ))}
          </section>

          <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
            <section aria-labelledby="recent-h">
              <div className="mb-3 flex items-center justify-between"><h2 id="recent-h" className="text-lg font-semibold">Recently added</h2><Link href="/memory" className="text-sm text-accent hover:underline">Open My Memory</Link></div>
              {recent.loading ? <div className="space-y-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div>
                : recent.data && recent.data.items.length > 0 ? <TimelineList items={recent.data.items} grouped={false} />
                : <p className="panel p-4 text-sm text-muted">Nothing added yet.</p>}
            </section>
            <aside className="space-y-4">
              <div className="glass p-4">
                <div className="flex items-center gap-2"><NotebookPen className="h-4 w-4 text-accent" aria-hidden /><h2 className="text-sm font-semibold">Notes</h2></div>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{c.notes}</p>
                <Button variant="glass" size="sm" className="mt-3" onClick={() => openAdd("note")}>New note</Button>
              </div>
              {storage.data && (
                <div className="glass p-4">
                  <h2 className="text-sm font-semibold">Storage</h2>
                  <Progress value={(storage.data.usedBytes / Math.max(1, storage.data.quotaBytes)) * 100} className="mt-3" />
                  <p className="mt-2 text-xs text-muted">{humanSize(storage.data.usedBytes)} of {humanSize(storage.data.quotaBytes)} used</p>
                </div>
              )}
            </aside>
          </div>
        </>
      )}
      {home.error && <p role="alert" className="text-center text-sm text-danger">{home.error}</p>}
    </div>
  );
}
