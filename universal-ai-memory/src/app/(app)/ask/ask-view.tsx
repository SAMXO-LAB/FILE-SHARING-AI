"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Download, History, Loader2, MessageSquarePlus, MoreHorizontal, Paperclip, Pencil, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/app/app-context";
import { AssistantBlock, type ChatMessage, type Structured } from "@/components/app/answer-block";
import { useUploads } from "@/components/app/upload-context";
import { Button } from "@/components/ui/button";
import { useDialogs } from "@/components/ui/confirm";
import { Badge, EmptyState, Skeleton } from "@/components/ui/misc";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlay";
import { api, errorMessage, useFetch } from "@/lib/client/api";
import type { ContentCard } from "@/lib/retrieval/types";
import { cn, timeAgo } from "@/lib/utils";

interface Attachment { id: string; name: string; state: "uploading" | "processing" | "ready" | "failed"; error?: string }
interface AskResponse {
  conversationId: string;
  userMessage: { id: string; content: string; attachments: { id: string; name: string }[] };
  assistantMessage: { id: string; content: string; structured: Structured };
  cards: ContentCard[];
}
interface ConvResponse { conversation: { id: string; title: string }; messages: { id: string; role: "user" | "assistant"; content: string; structured: Structured; attachments: { id: string; name: string }[]; cards: ContentCard[]; removedCards: number }[] }

const STARTERS = ["What did I add recently?", "Find my PDFs", "Show links I saved recently", "Find duplicate files"];

export function AskView() {
  const router = useRouter();
  const params = useSearchParams();
  const { caps, prefs } = useApp();
  const uploads = useUploads();
  const { confirm, prompt } = useDialogs();
  const history = useFetch<{ conversations: { id: string; title: string; updated_at: string }[] }>("/api/ask/conversations");

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [title, setTitle] = useState("New chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const loadedFor = useRef<string | null>(null);
  const autoSent = useRef(false);

  const urlChat = params.get("c");
  // ?collection=<id> scopes questions to one collection until the chip is removed.
  const [scopeId, setScopeId] = useState<string | null>(params.get("collection"));
  const scope = useFetch<{ collection: { id: string; name: string } }>(scopeId ? `/api/collections/${scopeId}` : null);

  // Load a conversation from the URL (but not the one we just created ourselves).
  useEffect(() => {
    if (!urlChat) {
      if (loadedFor.current !== null) { loadedFor.current = null; setConversationId(null); setMessages([]); setTitle("New chat"); }
      return;
    }
    if (loadedFor.current === urlChat) return;
    loadedFor.current = urlChat;
    setLoadingChat(true);
    api<ConvResponse>(`/api/ask/conversations/${urlChat}`)
      .then((r) => {
        setConversationId(r.conversation.id);
        setTitle(r.conversation.title);
        setMessages(r.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, structured: m.structured, cards: m.cards, removedCards: m.removedCards, attachments: m.attachments })));
      })
      .catch((e) => { toast.error("Couldn't open that chat", { description: errorMessage(e) }); router.replace("/ask"); })
      .finally(() => setLoadingChat(false));
  }, [urlChat, router]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, busy]);

  const send = useCallback(async (text: string, opts: { dropped?: ("sender" | "date" | "type" | "source")[] } = {}) => {
    const question = text.trim();
    if (!question || busy) return;
    const atts = attachments.filter((a) => a.state === "ready").map((a) => ({ id: a.id, name: a.name }));
    const tempId = `tmp-${crypto.randomUUID()}`;
    setMessages((m) => [...m, { id: tempId, role: "user", content: question, question, attachments: atts }]);
    setInput("");
    setAttachments([]);
    setBusy(true);
    try {
      const r = await api<AskResponse>("/api/ask", {
        body: { conversationId: conversationId ?? undefined, question, attachmentFileIds: atts.length ? atts.map((a) => a.id) : undefined, filters: opts.dropped || scopeId ? { ...(opts.dropped ? { dropped: opts.dropped } : {}), ...(scopeId ? { collectionId: scopeId } : {}) } : undefined, tzOffsetMinutes: new Date().getTimezoneOffset() },
      });
      setMessages((m) => [
        ...m.map((x) => (x.id === tempId ? { ...x, id: r.userMessage.id } : x)),
        { id: r.assistantMessage.id, role: "assistant", content: r.assistantMessage.content, structured: r.assistantMessage.structured, cards: r.cards },
      ]);
      if (!conversationId) {
        setConversationId(r.conversationId);
        setTitle(question.slice(0, 80));
        loadedFor.current = r.conversationId;
        router.replace(`/ask?c=${r.conversationId}`, { scroll: false });
      }
      void history.reload();
    } catch (e) {
      setMessages((m) => [...m, { id: `err-${tempId}`, role: "assistant", content: "", error: errorMessage(e), question }]);
    } finally {
      setBusy(false);
      taRef.current?.focus();
    }
  }, [attachments, busy, conversationId, history, router, scopeId]);

  // ?q=… from the Home search box: ask once.
  useEffect(() => {
    const q = params.get("q");
    if (q && !urlChat && !autoSent.current) { autoSent.current = true; void send(q); }
  }, [params, urlChat, send]);

  function onFiles(list: FileList | null) {
    if (!list?.length) return;
    for (const file of Array.from(list).slice(0, 4 - attachments.length)) {
      uploads.add([file], {
        source: "ai_chat",
        onUploaded: (id, name) => setAttachments((a) => [...a.filter((x) => x.id !== `pending-${name}`), { id, name, state: "processing" }]),
        onSettled: (id, status) => setAttachments((a) => a.map((x) => (x.id === id ? { ...x, state: status === "ready" ? "ready" : "failed", error: status === "ready" ? undefined : "This file couldn't be read." } : x))),
      });
      setAttachments((a) => [...a, { id: `pending-${file.name}`, name: file.name, state: "uploading" }]);
    }
  }

  // Uploads that never reach "uploaded": failed/cancelled ones show as unreadable; duplicates reuse the existing file.
  useEffect(() => {
    if (!attachments.some((a) => a.id.startsWith("pending-"))) return;
    setAttachments((prev) => prev.map((a) => {
      if (!a.id.startsWith("pending-")) return a;
      const it = uploads.items.find((i) => i.name === a.name && ["failed", "cancelled", "duplicate"].includes(i.status));
      if (!it) return a;
      if (it.status === "duplicate" && it.duplicateOf) { uploads.dismiss(it.id); return { id: it.duplicateOf.id, name: a.name, state: "ready" as const }; }
      return { ...a, state: "failed" as const, error: it.error ?? "The upload didn't finish." };
    }));
  }, [uploads, attachments]);

  const blocked = attachments.some((a) => a.state === "uploading" || a.state === "processing");

  async function rename() {
    if (!conversationId) return;
    const t = await prompt({ title: "Rename chat", label: "Title", initial: title });
    if (!t) return;
    try { await api(`/api/ask/conversations/${conversationId}`, { method: "PATCH", body: { title: t } }); setTitle(t); void history.reload(); } catch (e) { toast.error(errorMessage(e)); }
  }
  async function remove(id: string) {
    if (!(await confirm({ title: "Delete this chat?", description: "The conversation is removed from your history. Your files and notes aren't affected.", confirmLabel: "Delete", danger: true }))) return;
    try {
      await api(`/api/ask/conversations/${id}`, { method: "DELETE" });
      void history.reload();
      if (id === conversationId) { router.replace("/ask"); }
    } catch (e) { toast.error(errorMessage(e)); }
  }

  const empty = messages.length === 0 && !loadingChat;
  const lastUserQuestion = (i: number) => { for (let k = i; k >= 0; k--) if (messages[k]?.role === "user") return messages[k]!.content; return ""; };

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-3xl flex-col">
      <header className="mb-4 flex items-center gap-2">
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold tracking-tight">{conversationId ? title : "Ask AI"}</h1>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="glass" size="sm"><History className="h-4 w-4" aria-hidden />History</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-96 w-80 overflow-y-auto">
            <DropdownMenuLabel>Recent chats</DropdownMenuLabel>
            {history.loading && <div className="p-2"><Skeleton className="h-8" /></div>}
            {history.data?.conversations.length === 0 && <p className="px-3 py-2 text-sm text-muted">No chats yet.</p>}
            {history.data?.conversations.map((c) => (
              <DropdownMenuItem key={c.id} onSelect={() => router.push(`/ask?c=${c.id}`)} className={cn("justify-between gap-3", c.id === conversationId && "bg-[rgb(var(--line)/0.1)]")}>
                <span className="min-w-0"><span className="block truncate">{c.title}</span><span className="block text-xs text-muted">{timeAgo(c.updated_at)}</span></span>
                <button className="rounded p-1 text-muted hover:text-danger" aria-label={`Delete chat ${c.title}`} onClick={(e) => { e.stopPropagation(); void remove(c.id); }}><Trash2 className="h-3.5 w-3.5" /></button>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="glass" size="sm" onClick={() => router.push("/ask")}><MessageSquarePlus className="h-4 w-4" aria-hidden />New</Button>
        {conversationId && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Chat options"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void rename()}><Pencil className="h-4 w-4" aria-hidden />Rename</DropdownMenuItem>
              <DropdownMenuItem asChild><a href={`/api/ask/conversations/${conversationId}/export`} download><Download className="h-4 w-4" aria-hidden />Export as Markdown</a></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem danger onSelect={() => void remove(conversationId)}><Trash2 className="h-4 w-4" aria-hidden />Delete chat</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      {scopeId && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 py-1 pl-3 pr-1.5 text-accent">
            Only searching the collection “{scope.data?.collection.name ?? "…"}”
            <button type="button" onClick={() => setScopeId(null)} className="grid h-5 w-5 place-items-center rounded-full hover:bg-accent/20" aria-label="Search all of my memory instead"><X className="h-3 w-3" /></button>
          </span>
          {scope.error && <span className="text-danger">That collection couldn't be loaded.</span>}
        </div>
      )}

      <div className="flex-1 space-y-6" aria-live="polite">
        {loadingChat && <div className="space-y-3"><Skeleton className="ml-auto h-12 w-2/3" /><Skeleton className="h-40" /></div>}
        {empty && (
          <div className="space-y-5 pt-8">
            <EmptyState icon={Sparkles} title="Ask about anything you've saved">
              Ask in plain language: “find the PDF about solar panels”, “what did we decide in the project chat last month?”, then follow up with “summarize the second one”. Answers cite where they came from.
            </EmptyState>
            <div className="flex flex-wrap justify-center gap-2">{STARTERS.map((s) => <button key={s} onClick={() => void send(s)} className="glass px-3.5 py-1.5 text-sm text-muted !rounded-full hover:text-fg">{s}</button>)}</div>
            {!caps.ai && <p className="text-center text-xs text-muted">No AI provider is configured on this server: you'll see matching passages and files instead of written answers.</p>}
            {caps.ai && (prefs.processing_mode === "metadata_only" || prefs.processing_mode === "extraction") && <p className="text-center text-xs text-muted">Your privacy mode keeps content away from AI providers, so answers list matching passages. <Link href="/settings?tab=privacy" className="underline">Change this</Link></p>}
          </div>
        )}
        {messages.map((m, i) => m.role === "user" ? (
          <div key={m.id} className="flex flex-col items-end gap-1.5">
            <div className="bubble bubble-user max-w-[85%] whitespace-pre-wrap break-words text-[15px]">{m.content}</div>
            {m.attachments && m.attachments.length > 0 && <div className="flex flex-wrap justify-end gap-1.5">{m.attachments.map((a) => <Badge key={a.id}><Paperclip className="h-3 w-3" aria-hidden />{a.name}</Badge>)}</div>}
          </div>
        ) : m.error ? (
          <div key={m.id} role="alert" className="panel flex flex-wrap items-center gap-3 border-danger/40 p-4 text-sm"><span className="flex-1 text-danger">{m.error}</span>{m.question && <Button size="sm" variant="glass" onClick={() => { setMessages((x) => x.filter((y) => y.id !== m.id)); void send(m.question!); }}>Try again</Button>}</div>
        ) : (
          <AssistantBlock key={m.id} m={m} onAsk={(t) => void send(t)} onRefine={(kind) => void send(lastUserQuestion(i), { dropped: [kind] })} />
        ))}
        {busy && (
          <div className="glass flex items-center gap-3 p-5 text-sm text-muted" role="status"><Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden />Searching your memory…</div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); void send(input); }} className="sticky bottom-3 mt-6">
        <div className="glass glass-strong p-2 !rounded-[calc(var(--radius)*1.2)]">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-2 pb-2 pt-1">
              {attachments.map((a) => (
                <span key={a.id} className={cn("inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-2.5 pr-1 text-xs", a.state === "failed" ? "border-danger/50 text-danger" : "border-line text-muted")} title={a.error}>
                  {(a.state === "uploading" || a.state === "processing") && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
                  {a.name}{a.state === "processing" && " · reading…"}{a.state === "failed" && " · unreadable"}
                  <button type="button" onClick={() => setAttachments((x) => x.filter((y) => y.id !== a.id))} className="grid h-4 w-4 place-items-center rounded-full hover:bg-[rgb(var(--line)/0.2)]" aria-label={`Remove ${a.name}`}><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-end gap-1">
            <input ref={fileRef} type="file" multiple className="sr-only" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
            <Button type="button" variant="ghost" size="icon" aria-label="Attach a file" onClick={() => fileRef.current?.click()} disabled={attachments.length >= 4}><Paperclip className="h-5 w-5" /></Button>
            <label htmlFor="ask-input" className="sr-only">Your question</label>
            <textarea
              id="ask-input" ref={taRef} value={input} rows={1} maxLength={4000}
              onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`; }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!blocked) void send(input); } }}
              placeholder={attachments.length ? "Ask about the attached file…" : "Ask anything about your digital life..."}
              className="max-h-44 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-[15px] outline-none placeholder:text-muted/80"
            />
            <Button type="submit" size="icon" aria-label="Send" disabled={!input.trim() || busy || blocked}><ArrowUp className="h-5 w-5" /></Button>
          </div>
        </div>
        <p className="mt-2 text-center text-[11px] text-muted">Answers can be wrong. Check the sources before relying on them.</p>
      </form>
    </div>
  );
}
