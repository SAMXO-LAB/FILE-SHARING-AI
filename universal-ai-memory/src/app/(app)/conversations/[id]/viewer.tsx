"use client";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Info, Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDialogs } from "@/components/ui/confirm";
import { Badge, ErrorState, Skeleton } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/client/api";
import { cn, formatDate } from "@/lib/utils";
import type { ConversationRow, MessageRow } from "@/lib/types";

interface Page { conversation: ConversationRow; messages: MessageRow[]; hasEarlier: boolean; hasLater: boolean }

const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "time unknown");

export function ConversationViewer() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const seq = Number(useSearchParams().get("seq")) || undefined;
  const { confirm } = useDialogs();
  const [conv, setConv] = useState<ConversationRow | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [earlier, setEarlier] = useState(false);
  const [later, setLater] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const scrolled = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<Page>(`/api/conversations/${id}${seq ? `?around=${seq}` : ""}`);
      setConv(r.conversation); setMessages(r.messages); setEarlier(r.hasEarlier); setLater(r.hasLater); setError(null);
    } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }, [id, seq]);
  useEffect(() => { scrolled.current = false; void load(); }, [load]);

  useEffect(() => {
    if (loading || scrolled.current) return;
    scrolled.current = true;
    const el = seq ? document.getElementById(`m-${seq}`) : null;
    if (el) el.scrollIntoView({ block: "center" }); else window.scrollTo({ top: document.body.scrollHeight });
  }, [loading, seq, messages]);

  async function more(dir: "earlier" | "later") {
    const first = messages[0]?.seq, last = messages[messages.length - 1]?.seq;
    if (!first || !last) return;
    setBusy(true);
    try {
      const r = await api<Page>(`/api/conversations/${id}?${dir === "earlier" ? `before=${first}` : `after=${last}`}`);
      setMessages((m) => (dir === "earlier" ? [...r.messages, ...m] : [...m, ...r.messages]));
      if (dir === "earlier") setEarlier(r.hasEarlier); else setLater(r.hasLater);
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  }
  async function remove() {
    if (!(await confirm({ title: "Delete this conversation?", description: "The messages and their search index are deleted. Attachments imported with this chat stay in All Files.", confirmLabel: "Delete conversation", danger: true }))) return;
    try { await api(`/api/conversations/${id}`, { method: "DELETE" }); toast.success("Conversation deleted"); router.replace("/conversations"); } catch (e) { toast.error(errorMessage(e)); }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back to conversations"><Link href="/conversations"><ArrowLeft className="h-5 w-5" /></Link></Button>
        <div className="min-w-0 flex-1"><h1 className="truncate text-xl font-semibold">{conv?.title ?? "Conversation"}</h1>{conv && <p className="text-xs text-muted">{conv.message_count.toLocaleString()} messages · {conv.source_id === "telegram" ? "Telegram" : "WhatsApp"}</p>}</div>
        <Button variant="danger-ghost" size="sm" onClick={() => void remove()}><Trash2 className="h-4 w-4" aria-hidden />Delete</Button>
      </div>
      <p className="panel mb-5 flex gap-2 p-3 text-xs text-muted"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />Sender names and times come from the exported file. They're labels, not verified identities.</p>
      {loading ? <div className="space-y-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className={cn("h-12 w-2/3", i % 2 && "ml-auto")} />)}</div> : (
        <div className="space-y-1.5">
          {earlier && <div className="py-2 text-center"><Button variant="glass" size="sm" loading={busy} onClick={() => void more("earlier")}>Load earlier messages</Button></div>}
          {messages.map((m, idx) => {
            const dayOf = (x: typeof m | undefined) => (x?.sent_at ? formatDate(x.sent_at, { weekday: "short", day: "numeric", month: "long", year: "numeric" }) : "Date unknown");
            const day = dayOf(m);
            const sep = idx === 0 || day !== dayOf(messages[idx - 1]);
            return (
              <div key={m.id}>
                {sep && <div className="my-4 flex justify-center"><Badge>{day}</Badge></div>}
                {m.kind === "system" ? <p className="py-1 text-center text-xs text-muted">{m.body}</p> : (
                  <div id={`m-${m.seq}`} className={cn("panel max-w-[85%] scroll-mt-24 p-3", m.seq === seq && "!border-accent bg-accent/10 ring-2 ring-accent/50", m.sender_kind === "linked_account" && "ml-auto")}>
                    <div className="flex items-baseline justify-between gap-3"><span className="text-xs font-semibold text-accent">{m.sender_label ?? "Unknown sender"}</span><span className="text-[11px] text-muted">{time(m.sent_at)}</span></div>
                    <p className={cn("mt-1 whitespace-pre-wrap break-words text-sm", m.kind === "deleted" && "italic text-muted")}>{m.body || (m.kind === "media" ? "" : "")}</p>
                    {m.attachment_name && (m.attachment_file_id
                      ? <Link href={`/files?open=${m.attachment_file_id}`} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--line)/0.1)] px-2 py-1 text-xs hover:underline"><Paperclip className="h-3 w-3" aria-hidden />{m.attachment_name}</Link>
                      : <span className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted" title="The export didn't include this file."><Paperclip className="h-3 w-3" aria-hidden />{m.attachment_name} (not included in the export)</span>)}
                  </div>
                )}
              </div>
            );
          })}
          {later && <div className="py-2 text-center"><Button variant="glass" size="sm" loading={busy} onClick={() => void more("later")}>Load later messages</Button></div>}
        </div>
      )}
    </div>
  );
}
