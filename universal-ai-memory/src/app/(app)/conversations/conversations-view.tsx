"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { MessageCircle, MessagesSquare, Search, Send } from "lucide-react";
import { useAddToMemory } from "@/components/app/add-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui/misc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { useFetch } from "@/lib/client/api";
import { formatDate } from "@/lib/utils";

interface Conv { id: string; title: string; source_id: string; message_count: number; participants: string[]; first_message_at: string | null; last_message_at: string | null }

export function ConversationsView() {
  const { openAdd } = useAddToMemory();
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [source, setSource] = useState("all");
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const list = useFetch<{ conversations: Conv[]; total: number }>(`/api/conversations?limit=100${dq ? `&q=${encodeURIComponent(dq)}` : ""}${source !== "all" ? `&source=${source}` : ""}`);
  const rows = list.data?.conversations ?? [];
  return (
    <div>
      <PageHeader title="Conversations" description="Chats you've imported from WhatsApp or Telegram exports, and messages saved through the Telegram bot." actions={<Button onClick={() => openAdd("import")}>Import a chat</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden /><label htmlFor="conv-search" className="sr-only">Search conversations by name</label><Input id="conv-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by chat name…" className="pl-9" /></div>
        <Tabs value={source} onValueChange={setSource}><TabsList><TabsTrigger value="all">All</TabsTrigger><TabsTrigger value="whatsapp">WhatsApp</TabsTrigger><TabsTrigger value="telegram">Telegram</TabsTrigger></TabsList></Tabs>
      </div>
      {list.loading ? <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>
        : list.error ? <ErrorState message={list.error} onRetry={list.reload} />
        : rows.length === 0 ? <EmptyState icon={MessagesSquare} title={dq || source !== "all" ? "No conversations match" : "No conversations yet"} action={!dq && source === "all" ? <Button onClick={() => openAdd("import")}>Import a chat</Button> : undefined}>{dq || source !== "all" ? "Try a different name or filter." : "Export a chat from WhatsApp or Telegram Desktop and upload it. Names and times come from the file; nothing is read from your accounts."}</EmptyState>
        : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {rows.map((c) => (
              <li key={c.id}>
                <Link href={`/conversations/${c.id}`} className="glass flex h-full items-start gap-3 p-4 transition-transform hover:-translate-y-0.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-green-500/15 text-green-400">{c.source_id === "telegram" ? <Send className="h-5 w-5" aria-hidden /> : <MessageCircle className="h-5 w-5" aria-hidden />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.title}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">{c.participants.slice(0, 3).join(", ")}{c.participants.length > 3 ? ` +${c.participants.length - 3}` : ""}</p>
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted"><Badge>{c.source_id === "telegram" ? "Telegram" : "WhatsApp"}</Badge>{c.message_count.toLocaleString()} messages{c.last_message_at ? ` · last ${formatDate(c.last_message_at)}` : ""}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
