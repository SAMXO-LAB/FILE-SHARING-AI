"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Ban, Check, CheckCheck, Copy, Download, Eye, FolderOpen, Loader2, MoreHorizontal, Paperclip, Plus, Radio, Send, ShieldOff,
  UploadCloud, UserMinus, UserPlus, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import { AiSendButton } from "@/components/app/ai-bar";
import { useApp } from "@/components/app/app-context";
import { FileDetails } from "@/components/app/file-details";
import { TypeIcon } from "@/components/app/file-visuals";
import { friendName, MyFilesPicker, sendToFriend, useFileDrop, type FriendEntry, type FriendsResponse, type FriendUser } from "@/components/app/friends-shared";
import { useUploads } from "@/components/app/upload-context";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useDialogs } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlay";
import { api, errorMessage, useFetch } from "@/lib/client/api";
import { canShareFiles, shareFilesOut, shareStoredFileOut } from "@/lib/client/share-out";
import { humanSize } from "@/lib/files/types";
import { cn, formatDate, timeAgo } from "@/lib/utils";

interface ChatFile { id: string | null; shareId: string | null; name: string; size: number | null; category: string | null; mime: string | null; available: boolean }
interface ChatMessage { id: string; mine: boolean; body: string | null; at: string; read: boolean; file: ChatFile | null }
interface ChatResponse { friendship: { id: string; status: string; kind: FriendEntry["kind"] }; friend: FriendUser; hasMore: boolean; messages: ChatMessage[] }
interface Pending { key: string; name: string; friendshipId: string; size: number }

const CHANGED = "memory:friends-changed";
const ping = () => window.dispatchEvent(new Event(CHANGED));

export function FriendsView() {
  const router = useRouter();
  const params = useSearchParams();
  const selected = params.get("f");
  const list = useFetch<FriendsResponse>("/api/friends");
  const reloadList = list.reload;
  const uploads = useUploads();
  const [pending, setPending] = useState<Pending[]>([]);

  useEffect(() => {
    const t = setInterval(() => void reloadList(), 10_000);
    const h = () => void reloadList();
    window.addEventListener(CHANGED, h);
    return () => { clearInterval(t); window.removeEventListener(CHANGED, h); };
  }, [reloadList]);

  /** Uploads local files into your memory, then sends each one to the friend as soon as it's stored. */
  const sendLocal = useCallback((friendshipId: string, files: File[]) => {
    const batch = files.slice(0, 10);
    if (files.length > 10) toast("Sending the first 10 files", { description: "You can send up to 10 at a time." });
    for (const file of batch) {
      const key = `${file.name}:${file.size}:${Date.now()}:${Math.random()}`;
      setPending((p) => [...p, { key, name: file.name, friendshipId, size: file.size }]);
      uploads.add([file], {
        onUploaded: (fileId) => {
          void sendToFriend(friendshipId, [fileId])
            .catch((e) => toast.error(`Couldn't send ${file.name}`, { description: errorMessage(e) }))
            .finally(() => setPending((p) => p.filter((x) => x.key !== key)));
        },
      });
    }
  }, [uploads]);

  // Files already in memory come back as "duplicate": send the existing copy instead. Failures are reported.
  useEffect(() => {
    if (pending.length === 0) return;
    for (const p of pending) {
      const it = uploads.items.find((i) => i.name === p.name && ["duplicate", "failed", "cancelled"].includes(i.status));
      if (!it) continue;
      setPending((all) => all.filter((x) => x.key !== p.key));
      if (it.status === "duplicate" && it.duplicateOf) {
        uploads.dismiss(it.id);
        void sendToFriend(p.friendshipId, [it.duplicateOf.id]).catch((e) => toast.error(`Couldn't send ${p.name}`, { description: errorMessage(e) }));
      } else if (it.status === "failed") {
        toast.error(`Couldn't upload ${p.name}`, { description: it.error });
      }
    }
  }, [uploads, pending]);

  const open = (id: string | null) => router.replace(id ? `/friends?f=${id}` : "/friends", { scroll: false });
  const entries = list.data?.friends ?? [];

  return (
    <div className="-mb-20 grid h-[calc(100dvh-6.5rem)] min-h-[520px] gap-4 lg:h-[calc(100dvh-5rem)] lg:grid-cols-[340px_minmax(0,1fr)]">
      <aside className={cn("card flex min-h-0 flex-col overflow-hidden !p-0", selected && "hidden lg:flex")} aria-label="Friends">
        <FriendList entries={entries} loading={list.loading} error={list.error} selected={selected} onOpen={open} onDropFiles={sendLocal} />
      </aside>
      <section className={cn("card relative flex min-h-0 flex-col overflow-hidden !p-0", !selected && "hidden lg:flex")} aria-label="Chat">
        <AnimatePresence mode="wait">
          {selected ? (
            <motion.div key={selected} className="flex min-h-0 flex-1 flex-col" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.22 }}>
              <Chat id={selected} onBack={() => open(null)} onSendLocal={(files) => sendLocal(selected, files)} pending={pending.filter((p) => p.friendshipId === selected)} uploadsProgress={uploads.items} />
            </motion.div>
          ) : (
            <motion.div key="empty" className="flex flex-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ChatEmpty hasFriends={entries.some((e) => e.kind === "friend")} />
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------- */

function FriendList({ entries, loading, error, selected, onOpen, onDropFiles }: { entries: FriendEntry[]; loading: boolean; error: string | null; selected: string | null; onOpen: (id: string | null) => void; onDropFiles: (id: string, files: File[]) => void }) {
  const { profile } = useApp();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const friends = entries.filter((e) => e.kind === "friend" && (!filter || `${e.user.username} ${e.user.displayName ?? ""}`.toLowerCase().includes(filter.toLowerCase())));
  const incoming = entries.filter((e) => e.kind === "incoming");
  const outgoing = entries.filter((e) => e.kind === "outgoing");
  const blocked = entries.filter((e) => e.kind === "blocked");

  async function add() {
    const u = name.trim().replace(/^@/, "");
    if (!u) return;
    setBusy(true);
    try {
      const r = await api<{ id: string; status: "requested" | "accepted"; username: string }>("/api/friends", { body: { username: u } });
      setName("");
      toast.success(r.status === "accepted" ? `You and @${r.username} are now friends` : `Friend request sent to @${r.username}`);
      ping();
      if (r.status === "accepted") onOpen(r.id);
    } catch (e) { toast.error("Couldn't add friend", { description: errorMessage(e) }); } finally { setBusy(false); }
  }
  async function respond(id: string, action: "accept" | "decline") {
    try { await api(`/api/friends/${id}`, { method: "PATCH", body: { action } }); ping(); if (action === "accept") { toast.success("Friend added"); onOpen(id); } } catch (e) { toast.error(errorMessage(e)); }
  }
  async function cancel(id: string) {
    try { await api(`/api/friends/${id}`, { method: "DELETE" }); ping(); } catch (e) { toast.error(errorMessage(e)); }
  }
  async function unblock(id: string) {
    try { await api(`/api/friends/${id}`, { method: "PATCH", body: { action: "unblock" } }); ping(); toast.success("Unblocked"); } catch (e) { toast.error(errorMessage(e)); }
  }

  return (
    <>
      <div className="border-b hairline p-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-[22px] font-semibold tracking-[-0.025em]">Friends</h1>
          <button
            type="button"
            onClick={() => { void navigator.clipboard?.writeText(profile.username).then(() => toast.success("Username copied. Send it to a friend so they can add you.")); }}
            className="inline-flex items-center gap-1.5 rounded-full border hairline bg-[rgb(var(--line)/0.03)] px-2.5 py-1 text-[12px] text-muted transition-colors hover:border-accent/30 hover:text-accent"
            title="Copy your username"
          >
            You: <span className="font-medium text-fg">@{profile.username}</span><Copy className="h-3 w-3" aria-hidden />
          </button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void add(); }} className="mt-3 flex gap-2">
          <label htmlFor="add-friend" className="sr-only">Friend's username</label>
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-subtle">@</span>
            <Input id="add-friend" value={name} onChange={(e) => setName(e.target.value)} placeholder="friend's username" autoCapitalize="none" spellCheck={false} maxLength={31} className="pl-7" />
          </div>
          <motion.div whileTap={{ scale: 0.94 }}><Button type="submit" loading={busy} disabled={!name.trim()} aria-label="Add friend">{!busy && <UserPlus className="h-4 w-4" aria-hidden />}Add</Button></motion.div>
        </form>
      </div>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
        {loading && <div className="space-y-2 p-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>}
        {error && <p role="alert" className="p-3 text-sm text-danger">{error}</p>}

        <AnimatePresence initial={false}>
          {incoming.length > 0 && (
            <motion.div key="incoming" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-2 overflow-hidden">
              <p className="eyebrow px-2 pb-1 pt-2 !text-[11px]">Friend requests</p>
              {incoming.map((f) => (
                <motion.div layout key={f.id} className="flex items-center gap-3 rounded-xl bg-accent-soft/60 p-2.5">
                  <Avatar value={f.user.avatar} seed={f.user.id} size={40} />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{friendName(f.user)}</p><p className="truncate text-xs text-muted">@{f.user.username} wants to be friends</p></div>
                  <Button size="icon-sm" aria-label={`Accept @${f.user.username}`} onClick={() => void respond(f.id, "accept")}><Check className="h-4 w-4" /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`Decline @${f.user.username}`} onClick={() => void respond(f.id, "decline")}><X className="h-4 w-4" /></Button>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {entries.some((e) => e.kind === "friend") && (
          <div className="px-2 pb-2 pt-1"><Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search friends" aria-label="Search friends" className="h-8 text-[13px]" /></div>
        )}
        <ul className="stagger-in space-y-0.5">
          {friends.map((f) => <FriendRow key={f.id} f={f} active={f.id === selected} onOpen={() => onOpen(f.id)} onDropFiles={(files) => onDropFiles(f.id, files)} />)}
        </ul>
        {!loading && entries.length === 0 && (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <div className="empty-icon grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent"><Users className="h-7 w-7" aria-hidden /></div>
            <p className="mt-4 font-medium">Add your first friend</p>
            <p className="mt-1 text-sm text-muted">Type their Share Files AI username above. Once they accept, you can chat and send files by dragging them onto their name.</p>
          </div>
        )}

        {outgoing.length > 0 && (
          <div className="mt-3">
            <p className="eyebrow px-2 pb-1 !text-[11px]">Waiting for them</p>
            {outgoing.map((f) => (
              <div key={f.id} className="flex items-center gap-3 rounded-xl p-2">
                <Avatar value={f.user.avatar} seed={f.user.id} size={34} className="opacity-70" />
                <div className="min-w-0 flex-1"><p className="truncate text-sm">@{f.user.username}</p><p className="text-xs text-muted">Request sent {timeAgo(f.since)}</p></div>
                <Button size="sm" variant="ghost" onClick={() => void cancel(f.id)}>Cancel</Button>
              </div>
            ))}
          </div>
        )}
        {blocked.length > 0 && (
          <div className="mt-3">
            <p className="eyebrow px-2 pb-1 !text-[11px]">Blocked</p>
            {blocked.map((f) => (
              <div key={f.id} className="flex items-center gap-3 rounded-xl p-2">
                <Avatar value={f.user.avatar} seed={f.user.id} size={34} className="grayscale" />
                <p className="min-w-0 flex-1 truncate text-sm text-muted">@{f.user.username}</p>
                <Button size="sm" variant="ghost" onClick={() => void unblock(f.id)}><ShieldOff className="h-3.5 w-3.5" aria-hidden />Unblock</Button>
              </div>
            ))}
          </div>
        )}
      </div>
      <NearbyCard />
    </>
  );
}

function FriendRow({ f, active, onOpen, onDropFiles }: { f: FriendEntry; active: boolean; onOpen: () => void; onDropFiles: (files: File[]) => void }) {
  const ref = useFileDrop<HTMLLIElement>((files) => { onDropFiles(files); toast(`Sending ${files.length} file${files.length === 1 ? "" : "s"} to ${friendName(f.user)}`); });
  return (
    <li ref={ref} data-drop-attach data-drop-local data-drop-label={`send to ${friendName(f.user)}`} className="friend-drop rounded-xl">
      <button onClick={onOpen} aria-current={active ? "true" : undefined} className={cn("relative flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-[rgb(var(--line)/0.04)]", active && "bg-accent-soft hover:bg-accent-soft")}>
        <span className="relative">
          <Avatar value={f.user.avatar} seed={f.user.id} size={42} />
          {f.unread > 0 && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[10.5px] font-semibold text-white ring-2 ring-[var(--card)]">{f.unread > 99 ? "99+" : f.unread}</motion.span>}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={cn("truncate text-[14px]", f.unread ? "font-semibold" : "font-medium")}>{friendName(f.user)}</span>
            {f.lastMessage && <span className="shrink-0 text-[11px] text-subtle">{timeAgo(f.lastMessage.at)}</span>}
          </span>
          <span className={cn("block truncate text-[12.5px]", f.unread ? "text-fg" : "text-muted")}>
            {f.lastMessage ? `${f.lastMessage.mine ? "You: " : ""}${f.lastMessage.text}` : <span className="text-subtle">Drop files here to send</span>}
          </span>
        </span>
      </button>
    </li>
  );
}

/** Share with people nearby or in other apps through the device's share sheet. */
function NearbyCard() {
  const input = useRef<HTMLInputElement>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => { setSupported(canShareFiles()); }, []);
  async function go(files: FileList | null) {
    if (!files?.length) return;
    try {
      const r = await shareFilesOut(Array.from(files));
      if (r === "downloaded") toast("This browser can't open the share sheet", { description: "On a phone, this opens Quick Share / Nearby Share, AirDrop, WhatsApp and more." });
    } catch (e) { toast.error("Couldn't share", { description: errorMessage(e) }); }
  }
  return (
    <div className="border-t hairline p-3">
      <button type="button" onClick={() => input.current?.click()} className="group flex w-full items-center gap-3 rounded-xl bg-gradient-to-r from-[#2F8CFF]/10 to-[#8b5cf6]/10 p-3 text-left transition-transform hover:-translate-y-0.5">
        <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#2F8CFF] to-[#1E4FD8] text-white">
          <span className="ai-ring" aria-hidden /><Radio className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block text-[13.5px] font-semibold">Share nearby or to other apps</span>
          <span className="block text-[11.5px] leading-snug text-muted">{supported === false ? "Works on phones: Quick Share, AirDrop, WhatsApp, Gmail…" : "Quick Share / Nearby, AirDrop (Bluetooth & Wi-Fi), WhatsApp, Gmail…"}</span>
        </span>
      </button>
      <input ref={input} type="file" multiple className="sr-only" onChange={(e) => { void go(e.target.files); e.target.value = ""; }} />
    </div>
  );
}

function ChatEmpty({ hasFriends }: { hasFriends: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }} className="relative grid h-20 w-20 place-items-center rounded-[26px] bg-gradient-to-br from-[#2F8CFF] to-[#1E4FD8] text-white shadow-[0_18px_40px_-14px_#2F8CFF]">
        <span className="ai-ring" aria-hidden /><Send className="h-9 w-9 -translate-x-0.5" strokeWidth={1.8} aria-hidden />
      </motion.div>
      <h2 className="mt-6 text-[24px] font-semibold tracking-[-0.03em]">Send to <span className="text-gradient-brand">friends</span></h2>
      <p className="mt-2 max-w-sm text-[14.5px] leading-relaxed text-muted">{hasFriends ? "Pick a friend to open your chat. Drag files onto any friend to send them instantly." : "Add a friend by username. Every file you send is private to the two of you, and you can stop sharing any time."}</p>
      <div className="mt-6 grid w-full max-w-md gap-2 text-left text-[13px] sm:grid-cols-3">
        {[{ i: UploadCloud, t: "Drag & drop any file" }, { i: Eye, t: "They can open it right away" }, { i: Ban, t: "Stop sharing any time" }].map(({ i: I, t }, k) => (
          <motion.div key={t} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + k * 0.07 }} className="flex items-center gap-2 rounded-xl border hairline p-2.5"><I className="h-4 w-4 shrink-0 text-accent" aria-hidden />{t}</motion.div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------- */

function Chat({ id, onBack, onSendLocal, pending, uploadsProgress }: { id: string; onBack: () => void; onSendLocal: (files: File[]) => void; pending: Pending[]; uploadsProgress: { name: string; progress: number; status: string }[] }) {
  const chat = useFetch<ChatResponse>(`/api/friends/${id}/messages`);
  const reload = chat.reload;
  const { confirm } = useDialogs();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const outRef = useRef<HTMLInputElement>(null);
  const count = chat.data?.messages.length ?? 0;

  useEffect(() => {
    const t = setInterval(() => void reload(), 4000);
    const h = () => void reload();
    window.addEventListener(CHANGED, h);
    return () => { clearInterval(t); window.removeEventListener(CHANGED, h); };
  }, [reload]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [count, pending.length]);

  const dropRef = useFileDrop<HTMLDivElement>((files) => onSendLocal(files));
  const friend = chat.data?.friend;
  const kind = chat.data?.friendship.kind;

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try { await sendToFriend(id, [], body); setText(""); await reload(); } catch (e) { toast.error("Couldn't send", { description: errorMessage(e) }); } finally { setSending(false); }
  }
  async function act(action: "remove" | "block" | "accept" | "decline" | "unblock") {
    if (!friend) return;
    if (action === "remove" && !(await confirm({ title: `Remove @${friend.username}?`, description: "Your chat is deleted for both of you, and files sent in it stop being shared.", confirmLabel: "Remove friend", danger: true }))) return;
    if (action === "block" && !(await confirm({ title: `Block @${friend.username}?`, description: "They can't message you or send files, and files sent in this chat stop being shared. They aren't told.", confirmLabel: "Block", danger: true }))) return;
    try {
      if (action === "remove") { await api(`/api/friends/${id}`, { method: "DELETE" }); ping(); onBack(); return; }
      await api(`/api/friends/${id}`, { method: "PATCH", body: { action } });
      ping();
      if (action === "decline" || action === "unblock") onBack(); else await reload();
    } catch (e) { toast.error(errorMessage(e)); }
  }
  async function stopSharing(m: ChatMessage) {
    if (!m.file?.shareId) return;
    try { await api(`/api/shares/${m.file.shareId}`, { method: "DELETE" }); toast.success("Stopped sharing"); await reload(); } catch (e) { toast.error(errorMessage(e)); }
  }
  async function download(f: ChatFile) {
    if (!f.id) return;
    try { const r = await api<{ url: string }>(`/api/files/${f.id}/url?mode=download`); window.location.assign(r.url); } catch (e) { toast.error("Couldn't download", { description: errorMessage(e) }); }
  }
  async function shareOut(f: ChatFile) {
    if (!f.id) return;
    try { const r = await shareStoredFileOut(f.id, f.name, f.mime, f.size); if (r === "downloaded") toast("Downloaded instead", { description: "This browser can't open the share sheet." }); } catch (e) { toast.error("Couldn't share", { description: errorMessage(e) }); }
  }

  const groups = useMemo(() => {
    const out: { day: string; items: ChatMessage[] }[] = [];
    for (const m of chat.data?.messages ?? []) {
      const day = formatDate(m.at, { weekday: "long", day: "numeric", month: "short" });
      if (out.at(-1)?.day !== day) out.push({ day, items: [] });
      out.at(-1)!.items.push(m);
    }
    return out;
  }, [chat.data]);

  const canSend = kind === "friend";

  return (
    <div ref={dropRef} data-drop-attach data-drop-local data-drop-label={friend ? `send to ${friendName(friend)}` : "send"} className="chat-drop flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b hairline px-3 py-2.5 sm:px-4">
        <Button size="icon-sm" variant="ghost" className="lg:hidden" aria-label="Back to friends" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        {friend ? <Avatar value={friend.avatar} seed={friend.id} size={38} /> : <Skeleton className="h-[38px] w-[38px] rounded-full" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{friend ? friendName(friend) : "…"}</p>
          <p className="truncate text-xs text-muted">{friend ? `@${friend.username}` : ""}</p>
        </div>
        {canSend && <Button size="sm" variant="glass" onClick={() => outRef.current?.click()} title="Quick Share / Nearby, AirDrop, WhatsApp…"><Radio className="h-4 w-4 text-accent" aria-hidden /><span className="hidden sm:inline">Nearby &amp; apps</span></Button>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button size="icon-sm" variant="ghost" aria-label="Chat options"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {kind === "blocked" ? <DropdownMenuItem onSelect={() => void act("unblock")}><ShieldOff className="h-4 w-4" aria-hidden />Unblock</DropdownMenuItem> : (
              <>
                <DropdownMenuItem onSelect={() => void act("remove")}><UserMinus className="h-4 w-4" aria-hidden />{kind === "friend" ? "Remove friend" : "Cancel request"}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem danger onSelect={() => void act("block")}><Ban className="h-4 w-4" aria-hidden />Block</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <input ref={outRef} type="file" multiple className="sr-only" onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) void shareFilesOut(f).then((r) => { if (r === "downloaded") toast("This browser can't open the share sheet", { description: "On a phone this offers Quick Share / Nearby Share, AirDrop and your apps." }); }).catch((err) => toast.error(errorMessage(err))); }} />
      </header>

      <div className="chat-bg min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5" aria-live="polite">
        {chat.loading && <div className="space-y-3"><Skeleton className="h-10 w-1/2" /><Skeleton className="ml-auto h-10 w-1/3" /><Skeleton className="h-16 w-2/3" /></div>}
        {chat.error && <p role="alert" className="text-sm text-danger">{chat.error}</p>}
        {kind === "incoming" && friend && (
          <div className="mx-auto mt-6 max-w-sm rounded-2xl border hairline bg-card p-5 text-center shadow-[var(--shadow-sm)]">
            <Avatar value={friend.avatar} seed={friend.id} size={56} className="mx-auto" />
            <p className="mt-3 font-medium">@{friend.username} wants to be friends</p>
            <div className="mt-4 flex justify-center gap-2"><Button onClick={() => void act("accept")}><Check className="h-4 w-4" aria-hidden />Accept</Button><Button variant="ghost" onClick={() => void act("decline")}>Decline</Button></div>
          </div>
        )}
        {kind === "outgoing" && friend && <p className="mx-auto mt-8 max-w-xs text-center text-sm text-muted">Waiting for @{friend.username} to accept your request. You can chat and send files once they do.</p>}
        {kind === "blocked" && <p className="mx-auto mt-8 max-w-xs text-center text-sm text-muted">You blocked this person. Unblock them from the menu to be able to add them again.</p>}
        {kind === "friend" && count === 0 && pending.length === 0 && !chat.loading && (
          <div className="mx-auto mt-10 max-w-xs text-center">
            <div className="empty-icon mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent"><UploadCloud className="h-7 w-7" aria-hidden /></div>
            <p className="mt-3 font-medium">Say hi or drop a file</p>
            <p className="mt-1 text-sm text-muted">Drag files anywhere into this chat to send them to {friend ? friendName(friend) : "your friend"}.</p>
          </div>
        )}

        {groups.map((g) => (
          <div key={g.day} className="space-y-1.5">
            <p className="sticky top-0 z-[1] mx-auto my-3 w-fit rounded-full bg-[color-mix(in_srgb,var(--card)_85%,transparent)] px-3 py-1 text-[11px] font-medium text-muted shadow-[var(--shadow-xs)] backdrop-blur">{g.day}</p>
            {g.items.map((m, i) => {
              const tail = g.items[i + 1]?.mine !== m.mine;
              return (
                <motion.div key={m.id} layout="position" initial={{ opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 420, damping: 32 }} className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
                  {m.file ? (
                    <FileBubble m={m} onOpen={() => m.file?.id && setOpenFile(m.file.id)} onDownload={() => void download(m.file!)} onShareOut={() => void shareOut(m.file!)} onStop={() => void stopSharing(m)} />
                  ) : (
                    <div className={cn("max-w-[min(78%,560px)] whitespace-pre-wrap break-words px-3.5 py-2 text-[14.5px] leading-relaxed shadow-[var(--shadow-xs)]", m.mine ? "rounded-2xl bg-gradient-to-br from-[#2F8CFF] to-[#1E4FD8] text-white" : "rounded-2xl border hairline bg-card", tail && (m.mine ? "rounded-br-md" : "rounded-bl-md"))}>
                      {m.body}
                      <span className={cn("ml-2 inline-flex translate-y-0.5 items-center gap-0.5 text-[10.5px]", m.mine ? "text-white/70" : "text-subtle")}>
                        {new Date(m.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        {m.mine && (m.read ? <CheckCheck className="h-3 w-3" aria-label="Seen" /> : <Check className="h-3 w-3" aria-label="Sent" />)}
                      </span>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        ))}
        {pending.map((p) => {
          const it = uploadsProgress.find((u) => u.name === p.name);
          return (
            <motion.div key={p.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-1.5 flex justify-end">
              <div className="w-64 rounded-2xl rounded-br-md border border-accent/25 bg-accent-soft p-3">
                <p className="flex items-center gap-2 truncate text-[13px] font-medium"><Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-accent" aria-hidden />{p.name}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[rgb(var(--line)/0.1)]"><motion.div className="h-full rounded-full bg-gradient-to-r from-[#2F8CFF] to-[#1E4FD8]" animate={{ width: `${Math.max(4, it?.progress ?? 0)}%` }} /></div>
                <p className="mt-1 text-[11px] text-muted">{it?.status === "finalizing" || it?.status === "processing" || (it?.progress ?? 0) >= 100 ? "Sending…" : `Uploading · ${humanSize(p.size)}`}</p>
              </div>
            </motion.div>
          );
        })}
        <div ref={endRef} />
      </div>

      {canSend && (
        <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="border-t hairline p-2.5 sm:p-3">
          <div className="flex items-end gap-1.5 rounded-[calc(var(--radius)*1.1)] border hairline bg-[rgb(var(--line)/0.02)] p-1.5 transition-colors focus-within:border-accent/40">
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-10 w-10 text-muted hover:text-accent" aria-label="Send a file"><Plus className="h-5 w-5" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start">
                <DropdownMenuItem onSelect={() => fileRef.current?.click()}><Paperclip className="h-4 w-4" aria-hidden />Upload from this device</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setPickOpen(true)}><FolderOpen className="h-4 w-4" aria-hidden />Choose from my files</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => outRef.current?.click()}><Radio className="h-4 w-4" aria-hidden />Nearby &amp; other apps</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <input ref={fileRef} type="file" multiple className="sr-only" onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) onSendLocal(f); }} />
            <label htmlFor="dm-input" className="sr-only">Message</label>
            <textarea
              id="dm-input" value={text} rows={1} maxLength={4000} placeholder="Write a message, or drop files here"
              onChange={(e) => { setText(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`; }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}
              className="max-h-36 min-h-10 flex-1 resize-none bg-transparent px-1.5 py-2 text-[14.5px] leading-6 outline-none placeholder:text-subtle focus-visible:outline-none"
            />
            <AiSendButton ready={!!text.trim()} busy={sending} label="Send message" />
          </div>
        </form>
      )}

      <MyFilesPicker open={pickOpen} onOpenChange={setPickOpen} onPick={(files) => { void sendToFriend(id, files.map((f) => f.id)).then(() => toast.success(`Sent ${files.length} file${files.length === 1 ? "" : "s"}`)).catch((e) => toast.error("Couldn't send", { description: errorMessage(e) })); }} />
      {openFile && <FileDetails fileId={openFile} onClose={() => setOpenFile(null)} onChanged={() => void reload()} />}
    </div>
  );
}

function FileBubble({ m, onOpen, onDownload, onShareOut, onStop }: { m: ChatMessage; onOpen: () => void; onDownload: () => void; onShareOut: () => void; onStop: () => void }) {
  const f = m.file!;
  return (
    <div className={cn("w-[min(80%,320px)] overflow-hidden rounded-2xl border shadow-[var(--shadow-xs)]", m.mine ? "rounded-br-md border-accent/25 bg-accent-soft" : "rounded-bl-md hairline bg-card", !f.available && "opacity-70")}>
      <button type="button" onClick={onOpen} disabled={!f.available} className="flex w-full items-center gap-3 p-3 text-left disabled:cursor-default">
        <TypeIcon category={f.category} mime={f.mime} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium">{f.name}</span>
          <span className="block text-[11.5px] text-muted">{f.size ? humanSize(Number(f.size)) : ""}{f.available ? "" : m.mine ? " · no longer shared" : " · no longer available"}</span>
        </span>
      </button>
      <div className="flex items-center gap-1 border-t hairline px-2 py-1.5">
        {f.available && <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px]" onClick={onOpen}><Eye className="h-3.5 w-3.5" aria-hidden />Open</Button>}
        {f.available && <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px]" onClick={onDownload}><Download className="h-3.5 w-3.5" aria-hidden />Save</Button>}
        {f.available && <Button size="icon-sm" variant="ghost" className="h-7 w-7" aria-label="Share nearby or to other apps" title="Nearby & other apps" onClick={onShareOut}><Radio className="h-3.5 w-3.5" /></Button>}
        <span className="ml-auto flex items-center gap-0.5 pr-1 text-[10.5px] text-subtle">
          {new Date(m.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          {m.mine && (m.read ? <CheckCheck className="h-3 w-3 text-accent" aria-label="Seen" /> : <Check className="h-3 w-3" aria-label="Sent" />)}
        </span>
        {m.mine && f.available && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="icon-sm" variant="ghost" className="h-7 w-7" aria-label="File options"><MoreHorizontal className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end"><DropdownMenuItem danger onSelect={onStop}><Ban className="h-4 w-4" aria-hidden />Stop sharing</DropdownMenuItem></DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
