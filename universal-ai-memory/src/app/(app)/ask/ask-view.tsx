"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Copy, Download, FileSearch, History, Link2, ListChecks, Loader2, MessageSquarePlus, MessagesSquare, MoreHorizontal, Paperclip, Pencil, ShieldCheck, Quote, Trash2, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/app/app-context";
import { AiBar, AiOrb, AiSendButton, AiThinking, CyclingPlaceholder } from "@/components/app/ai-bar";
import { AssistantBlock, type ChatMessage, type Structured } from "@/components/app/answer-block";
import { useUploads } from "@/components/app/upload-context";
import { Button } from "@/components/ui/button";
import { useDialogs } from "@/components/ui/confirm";
import { Badge, Skeleton } from "@/components/ui/misc";
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

/** Turns transport errors into something a person can act on. */
function friendlyError(e: unknown): string {
  const msg = errorMessage(e);
  if (/\b(504|502|503)\b/.test(msg)) return "The answer took too long and the server stopped waiting. Please try again in a moment.";
  if (/Failed to fetch|NetworkError/i.test(msg)) return "You seem to be offline. Check your connection and try again.";
  return msg;
}

const STARTERS = [
  { icon: FileSearch, title: "Find a file", q: "Find my PDFs", hint: "By topic, type, date or who sent it", tone: "from-[#2F8CFF]/15 to-[#1E4FD8]/5 text-[#1E4FD8] dark:text-[#7fb2ff]" },
  { icon: ListChecks, title: "Catch up", q: "What did I add recently?", hint: "A quick summary of what's new", tone: "from-emerald-400/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-300" },
  { icon: Link2, title: "Saved links", q: "Show links I saved recently", hint: "Articles and pages you kept", tone: "from-cyan-400/15 to-cyan-500/5 text-cyan-700 dark:text-cyan-300" },
  { icon: Copy, title: "Tidy up", q: "Find duplicate files", hint: "Spot copies taking up space", tone: "from-violet-400/15 to-violet-500/5 text-violet-600 dark:text-violet-300" },
];
const ASK_PROMPTS = ["Ask anything about your files, chats and links…", "Find the PDF about solar panels", "What did we decide in the project chat?", "Summarize the second one", "Show photos from my trip last month"];

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
      setMessages((m) => [...m, { id: `err-${tempId}`, role: "assistant", content: "", error: friendlyError(e), question, failedUserId: tempId }]);
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
          <div className="flex flex-col items-center pt-4 text-center sm:pt-10">
            <motion.div initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }}>
              <AiOrb size={76} />
            </motion.div>
            <motion.h2 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }} className="mt-7 text-[28px] font-semibold leading-tight tracking-[-0.035em] sm:text-[34px]">
              Ask your memory <span className="text-gradient-brand">anything</span>
            </motion.h2>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mt-2 max-w-md text-[15px] leading-relaxed text-muted">
              Plain language works best. Ask a question, then follow up with “summarize the second one”. Every answer shows where it came from.
            </motion.p>
            <motion.div initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.25 } } }} className="mt-8 grid w-full max-w-2xl gap-3 sm:grid-cols-2">
              {STARTERS.map((st) => (
                <motion.button
                  key={st.q}
                  variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.2, 0.8, 0.2, 1] } } }}
                  whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}
                  onClick={() => void send(st.q)}
                  className="group relative flex items-start gap-3 overflow-hidden rounded-[calc(var(--radius)*1.05)] border hairline bg-card p-4 text-left shadow-[var(--shadow-xs)] transition-[border-color,box-shadow] duration-200 hover:border-accent/35 hover:shadow-[var(--shadow-md)]"
                >
                  <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br", st.tone)}><st.icon className="h-5 w-5" strokeWidth={1.9} aria-hidden /></span>
                  <span className="min-w-0">
                    <span className="block text-[14.5px] font-semibold tracking-[-0.01em]">{st.title}</span>
                    <span className="mt-0.5 block text-[13px] text-muted">“{st.q}”</span>
                    <span className="mt-1 block text-[12px] text-subtle">{st.hint}</span>
                  </span>
                  <ArrowUpRight className="absolute right-3 top-3 h-4 w-4 text-subtle opacity-0 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent group-hover:opacity-100" aria-hidden />
                </motion.button>
              ))}
            </motion.div>
            <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[12.5px] text-muted">
              <li className="flex items-center gap-1.5"><Quote className="h-3.5 w-3.5 text-accent" aria-hidden />Answers cite sources</li>
              <li className="flex items-center gap-1.5"><MessagesSquare className="h-3.5 w-3.5 text-accent" aria-hidden />Follow-up questions</li>
              <li className="flex items-center gap-1.5"><UploadCloud className="h-3.5 w-3.5 text-accent" aria-hidden />Drop files to ask about them</li>
              <li className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-accent" aria-hidden />Private to you</li>
            </motion.ul>
            {!caps.ai && <p className="mt-5 text-center text-xs text-muted">No AI provider is configured on this server: you'll see matching passages and files instead of written answers.</p>}
            {caps.ai && (prefs.processing_mode === "metadata_only" || prefs.processing_mode === "extraction") && <p className="mt-5 text-center text-xs text-muted">Your privacy mode keeps content away from AI providers, so answers list matching passages. <Link href="/settings?tab=privacy" className="underline">Change this</Link></p>}
          </div>
        )}
        {messages.map((m, i) => m.role === "user" ? (
          <motion.div key={m.id} initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 380, damping: 30 }} className="flex origin-bottom-right flex-col items-end gap-1.5">
            <div className="bubble bubble-user max-w-[min(85%,640px)] whitespace-pre-wrap break-words text-[15px] leading-relaxed">{m.content}</div>
            {m.attachments && m.attachments.length > 0 && <div className="flex flex-wrap justify-end gap-1.5">{m.attachments.map((a) => <Badge key={a.id}><Paperclip className="h-3 w-3" aria-hidden />{a.name}</Badge>)}</div>}
          </motion.div>
        ) : m.error ? (
          <div key={m.id} role="alert" className="card flex flex-wrap items-center gap-3 border-danger/25 bg-danger/5 p-4 text-sm"><span className="flex-1 text-danger">{m.error}</span>{m.question && <Button size="sm" variant="glass" onClick={() => { setMessages((x) => x.filter((y) => y.id !== m.id && y.id !== m.failedUserId)); void send(m.question!); }}>Try again</Button>}</div>
        ) : (
          <AssistantBlock key={m.id} m={m} onAsk={(t) => void send(t)} onRefine={(kind) => void send(lastUserQuestion(i), { dropped: [kind] })} onRetry={() => void send(lastUserQuestion(i))} />
        ))}
        {busy && <AiThinking />}
        <div ref={endRef} />
      </div>

      {/* Solid, sticky composer with a fade above it so answers never show through or sit underneath. */}
      <form
        ref={formRef}
        onSubmit={(e) => { e.preventDefault(); void send(input); }}
        className="sticky bottom-0 z-10 -mx-2 mt-2 bg-gradient-to-t from-bg from-70% to-transparent px-2 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6"
      >
        <AiBar busy={busy} data-drop-attach data-drop-label="attach them to your question" innerClassName="p-2 shadow-[var(--shadow-md)]">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-2 pb-2 pt-1">
              {attachments.map((a) => (
                <motion.span layout initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} key={a.id} className={cn("inline-flex max-w-full items-center gap-1.5 rounded-lg border py-1 pl-2.5 pr-1 text-xs", a.state === "failed" ? "border-danger/30 bg-danger/5 text-danger" : "hairline bg-[rgb(var(--line)/0.03)] text-fg")} title={a.error}>
                  {(a.state === "uploading" || a.state === "processing") ? <Loader2 className="h-3 w-3 animate-spin text-accent" aria-hidden /> : <Paperclip className="h-3 w-3 text-muted" aria-hidden />}
                  {a.name}{a.state === "processing" && " · reading…"}{a.state === "failed" && " · unreadable"}
                  <button type="button" onClick={() => setAttachments((x) => x.filter((y) => y.id !== a.id))} className="grid h-4 w-4 place-items-center rounded-full hover:bg-[rgb(var(--line)/0.2)]" aria-label={`Remove ${a.name}`}><X className="h-3 w-3" /></button>
                </motion.span>
              ))}
            </div>
          )}
          <div className="flex items-end gap-1">
            <input ref={fileRef} type="file" multiple className="sr-only" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
            <Button type="button" variant="ghost" size="icon" className="h-10 w-10 text-muted hover:text-accent" aria-label="Attach a file (or drop one here)" title="Attach files, or drag and drop them here" onClick={() => fileRef.current?.click()} disabled={attachments.length >= 4}><Paperclip className="h-[18px] w-[18px]" /></Button>
            <label htmlFor="ask-input" className="sr-only">Your question</label>
            <span className="relative flex min-w-0 flex-1">
              <CyclingPlaceholder show={!input} prompts={attachments.length ? ["Ask about the attached file…", "Summarize this file", "What are the key dates in it?"] : ASK_PROMPTS} className="items-start px-1.5 py-2 text-[15px] leading-6" />
              <textarea
                id="ask-input" ref={taRef} value={input} rows={1} maxLength={4000}
                onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`; }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!blocked) void send(input); } }}
                className="relative max-h-44 min-h-10 flex-1 resize-none bg-transparent px-1.5 py-2 text-[15px] leading-6 outline-none focus-visible:outline-none"
              />
            </span>
            <AiSendButton ready={!!input.trim() && !blocked} busy={busy} />
          </div>
        </AiBar>
        <p className="mt-2 text-center text-[11.5px] text-subtle">{blocked ? "Waiting for attachments to finish reading…" : "Drop files here to ask about them. Answers can be wrong, so check the sources."}</p>
      </form>
    </div>
  );
}
