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
  const formRef = useRef<HTMLFormElement>(null);
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

  function onFiles(list: FileList | File[] | null) {
    if (!list || list.length === 0) return;
    for (const file of Array.from(list).slice(0, 4 - attachments.length)) {
      uploads.add([file], {
        source: "ai_chat",
        onUploaded: (id, name) => setAttachments((a) => [...a.filter((x) => x.id !== `pending-${name}`), { id, name, state: "processing" }]),
        onSettled: (id, status) => setAttachments((a) => a.map((x) => (x.id === id ? { ...x, state: status === "ready" ? "ready" : "failed", error: status === "ready" ? undefined : "This file couldn't be read." } : x))),
      });
      setAttachments((a) => [...a, { id: `pending-${file.name}`, name: file.name, state: "uploading" }]);
    }
  }

  // Files dropped onto the composer are attached (not sent). The drop overlay delivers them here.
  const onFilesRef = useRef(onFiles);
  useEffect(() => { onFilesRef.current = onFiles; });
  useEffect(() => {
    const zone = formRef.current?.querySelector("[data-drop-attach]");
    if (!zone) return;
    const h = (e: Event) => {
      onFilesRef.current((e as CustomEvent<File[]>).detail);
    };
    zone.addEventListener("memory:attach-files", h);
    return () => zone.removeEventListener("memory:attach-files", h);
  }, []);

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
    <div className="mx-auto -mb-24 flex min-h-[calc(100dvh-4rem)] w-full max-w-[880px] flex-col lg:min-h-[calc(100dvh-2.5rem)]">
      <header className="mb-6 flex items-center gap-2 border-b hairline pb-4">
        <h1 className="min-w-0 flex-1 truncate text-[20px] font-semibold tracking-[-0.02em]">{conversationId ? title : "Ask AI"}</h1>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="glass" size="sm"><History className="h-4 w-4 text-muted" aria-hidden /><span className="hidden sm:inline">History</span></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-96 w-80 overflow-y-auto">
            <DropdownMenuLabel>Recent chats</DropdownMenuLabel>
            {history.loading && <div className="p-2"><Skeleton className="h-8" /></div>}
            {history.data?.conversations.length === 0 && <p className="px-3 py-2 text-sm text-muted">No chats yet.</p>}
            {history.data?.conversations.map((c) => (
              <DropdownMenuItem key={c.id} onSelect={() => router.push(`/ask?c=${c.id}`)} className={cn("justify-between gap-3", c.id === conversationId && "bg-accent-soft")}>
                <span className="min-w-0"><span className="block truncate">{c.title}</span><span className="block text-xs text-muted">{timeAgo(c.updated_at)}</span></span>
                <button className="rounded p-1 text-muted hover:text-danger" aria-label={`Delete chat ${c.title}`} onClick={(e) => { e.stopPropagation(); void remove(c.id); }}><Trash2 className="h-3.5 w-3.5" /></button>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="glass" size="sm" onClick={() => router.push("/ask")}><MessageSquarePlus className="h-4 w-4 text-muted" aria-hidden /><span className="hidden sm:inline">New chat</span><span className="sr-only sm:hidden">New chat</span></Button>
        {conversationId && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="glass" size="icon-sm" aria-label="Chat options"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
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

      <div className="flex-1 space-y-8 pb-6" aria-live="polite">
        {loadingChat && <div className="space-y-3"><Skeleton className="ml-auto h-12 w-2/3" /><Skeleton className="h-40" /></div>}
        {empty && (
          <div className="space-y-6 pt-6 sm:pt-10">
            <EmptyState icon={Sparkles} title="Ask about anything you've saved">
              Ask in plain language: “find the PDF about solar panels”, “what did we decide in the project chat last month?”, then follow up with “summarize the second one”. Answers cite where they came from.
            </EmptyState>
            <div className="flex flex-wrap justify-center gap-2">{STARTERS.map((s) => <button key={s} onClick={() => void send(s)} className="inline-flex h-8 items-center rounded-full border hairline bg-card px-3.5 text-[13px] text-muted shadow-[var(--shadow-xs)] transition-colors hover:border-accent/30 hover:text-accent">{s}</button>)}</div>
            {!caps.ai && <p className="text-center text-xs text-muted">No AI provider is configured on this server: you'll see matching passages and files instead of written answers.</p>}
            {caps.ai && (prefs.processing_mode === "metadata_only" || prefs.processing_mode === "extraction") && <p className="text-center text-xs text-muted">Your privacy mode keeps content away from AI providers, so answers list matching passages. <Link href="/settings?tab=privacy" className="underline">Change this</Link></p>}
          </div>
        )}
        {messages.map((m, i) => m.role === "user" ? (
          <div key={m.id} className="animate-rise flex flex-col items-end gap-1.5">
            <div className="bubble bubble-user max-w-[min(85%,640px)] whitespace-pre-wrap break-words text-[15px] leading-relaxed">{m.content}</div>
            {m.attachments && m.attachments.length > 0 && <div className="flex flex-wrap justify-end gap-1.5">{m.attachments.map((a) => <Badge key={a.id}><Paperclip className="h-3 w-3" aria-hidden />{a.name}</Badge>)}</div>}
          </div>
        ) : m.error ? (
          <div key={m.id} role="alert" className="card flex flex-wrap items-center gap-3 border-danger/25 bg-danger/5 p-4 text-sm"><span className="flex-1 text-danger">{m.error}</span>{m.question && <Button size="sm" variant="glass" onClick={() => { setMessages((x) => x.filter((y) => y.id !== m.id)); void send(m.question!); }}>Try again</Button>}</div>
        ) : (
          <AssistantBlock key={m.id} m={m} onAsk={(t) => void send(t)} onRefine={(kind) => void send(lastUserQuestion(i), { dropped: [kind] })} onRetry={() => void send(lastUserQuestion(i))} />
        ))}
        {busy && (
          <div className="flex items-center gap-3 px-1 text-sm text-muted" role="status"><span className="grid h-7 w-7 place-items-center rounded-lg bg-accent-soft"><Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden /></span>Searching your memory…</div>
        )}
        <div ref={endRef} />
      </div>

      {/* Solid, sticky composer with a fade above it so answers never show through or sit underneath. */}
      <form
        ref={formRef}
        onSubmit={(e) => { e.preventDefault(); void send(input); }}
        className="sticky bottom-0 z-10 -mx-2 mt-2 bg-gradient-to-t from-bg from-70% to-transparent px-2 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6"
      >
        <div data-drop-attach data-drop-label="your question" className="focus-ring rounded-[calc(var(--radius)*1.25)] border hairline bg-card p-2 shadow-[var(--shadow-md)] transition-[border-color,box-shadow] duration-150 data-[drop-hover=true]:!bg-accent-soft">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-2 pb-2 pt-1">
              {attachments.map((a) => (
                <span key={a.id} className={cn("inline-flex max-w-full items-center gap-1.5 rounded-lg border py-1 pl-2.5 pr-1 text-xs", a.state === "failed" ? "border-danger/30 bg-danger/5 text-danger" : "hairline bg-[rgb(var(--line)/0.03)] text-fg")} title={a.error}>
                  {(a.state === "uploading" || a.state === "processing") && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
                  {a.name}{a.state === "processing" && " · reading…"}{a.state === "failed" && " · unreadable"}
                  <button type="button" onClick={() => setAttachments((x) => x.filter((y) => y.id !== a.id))} className="grid h-4 w-4 place-items-center rounded-full hover:bg-[rgb(var(--line)/0.2)]" aria-label={`Remove ${a.name}`}><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-end gap-1">
            <input ref={fileRef} type="file" multiple className="sr-only" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
            <Button type="button" variant="ghost" size="icon" className="text-muted hover:text-fg" aria-label="Attach a file" onClick={() => fileRef.current?.click()} disabled={attachments.length >= 4}><Paperclip className="h-[18px] w-[18px]" /></Button>
            <label htmlFor="ask-input" className="sr-only">Your question</label>
            <textarea
              id="ask-input" ref={taRef} value={input} rows={1} maxLength={4000}
              onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`; }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!blocked) void send(input); } }}
              placeholder={attachments.length ? "Ask about the attached file…" : "Ask anything about your digital life..."}
              className="max-h-44 min-h-10 flex-1 resize-none bg-transparent px-1.5 py-2 text-[15px] leading-6 outline-none placeholder:text-subtle focus-visible:outline-none"
            />
            <Button type="submit" size="icon" className="rounded-[11px]" aria-label="Send" disabled={!input.trim() || busy || blocked}>{busy ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.2} />}</Button>
          </div>
        </div>
        <p className="mt-2 text-center text-[11.5px] text-subtle">{blocked ? "Waiting for attachments to finish reading…" : "Answers can be wrong. Check the sources before relying on them."}</p>
      </form>
    </div>
  );
}
