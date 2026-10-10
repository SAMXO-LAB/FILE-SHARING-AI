"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Search, Send } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { api, errorMessage, useFetch } from "@/lib/client/api";
import { humanSize } from "@/lib/files/types";
import type { FileRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TypeIcon } from "./file-visuals";

export interface FriendUser { id: string; username: string; displayName: string | null; avatar: string | null }
export interface FriendEntry {
  id: string;
  kind: "friend" | "incoming" | "outgoing" | "blocked";
  since: string;
  user: FriendUser;
  lastMessage: { at: string; mine: boolean; text: string } | null;
  unread: number;
}
export interface FriendsResponse { friends: FriendEntry[]; totals: { unread: number; incoming: number } }

export const friendName = (u: FriendUser) => u.displayName || `@${u.username}`;

/** Receives files dropped onto an element (routed by the window-wide DropOverlay). */
export function useFileDrop<T extends HTMLElement>(onFiles: (files: File[]) => void) {
  const ref = useRef<T>(null);
  const cb = useRef(onFiles);
  useEffect(() => { cb.current = onFiles; });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = (e: Event) => { const f = (e as CustomEvent<File[]>).detail ?? []; if (f.length) cb.current(f); };
    el.addEventListener("memory:attach-files", h);
    return () => el.removeEventListener("memory:attach-files", h);
  }, []);
  return ref;
}

/** Sends already-stored files (and an optional note) to a friend's chat. */
export async function sendToFriend(friendshipId: string, fileIds: string[], body?: string) {
  await api(`/api/friends/${friendshipId}/messages`, { body: { fileIds: fileIds.length ? fileIds : undefined, body: body?.trim() || undefined } });
  window.dispatchEvent(new Event("memory:friends-changed"));
}

/** Pick one or more friends to send a stored file to (used from file details). */
export function SendToFriendDialog({ open, onOpenChange, fileIds, fileLabel }: { open: boolean; onOpenChange: (v: boolean) => void; fileIds: string[]; fileLabel: string }) {
  const list = useFetch<FriendsResponse>(open ? "/api/friends" : null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const friends = (list.data?.friends ?? []).filter((f) => f.kind === "friend");
  async function send() {
    setBusy(true);
    try {
      for (const id of picked) await sendToFriend(id, fileIds, note);
      toast.success(`Sent ${fileLabel} to ${picked.size} friend${picked.size === 1 ? "" : "s"}`);
      setPicked(new Set()); setNote("");
      onOpenChange(false);
    } catch (e) { toast.error("Couldn't send", { description: errorMessage(e) }); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Send to friends" description={`Send ${fileLabel}. They can open and download it right away; you can stop sharing any time.`}>
        {list.loading ? <Skeleton className="h-24" /> : friends.length === 0 ? (
          <p className="rounded-xl bg-[rgb(var(--line)/0.03)] p-4 text-sm text-muted">No friends yet. Open <a href="/friends" className="text-accent underline">Friends</a> and add someone by their username.</p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {friends.map((f) => {
              const on = picked.has(f.id);
              return (
                <li key={f.id}>
                  <button type="button" onClick={() => setPicked((s) => { const n = new Set(s); if (on) n.delete(f.id); else n.add(f.id); return n; })} aria-pressed={on}
                    className={cn("flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-[rgb(var(--line)/0.04)]", on && "bg-accent-soft")}>
                    <Avatar value={f.user.avatar} seed={f.user.id} size={36} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{friendName(f.user)}</span><span className="block truncate text-xs text-muted">@{f.user.username}</span></span>
                    <span className={cn("grid h-5 w-5 place-items-center rounded-full border", on ? "border-accent bg-accent text-white" : "hairline")}>{on && <Check className="h-3 w-3" strokeWidth={3} />}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Add a message (optional)" />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void send()} disabled={picked.size === 0} loading={busy}><Send className="h-4 w-4" aria-hidden />Send{picked.size > 1 ? ` to ${picked.size}` : ""}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Choose files already in your memory (searchable). */
export function MyFilesPicker({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (v: boolean) => void; onPick: (files: FileRow[]) => void }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const url = open ? `/api/files?view=recent&limit=60${debounced ? `&q=${encodeURIComponent(debounced)}` : ""}` : null;
  const files = useFetch<{ files: FileRow[] }>(url);
  const [picked, setPicked] = useState<Map<string, FileRow>>(new Map());
  const rows = useMemo(() => (files.data?.files ?? []).filter((f) => f.status !== "uploading"), [files.data]);
  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setPicked(new Map()); }}>
      <DialogContent title="Choose from your files" description="Pick up to 10 files to send." className="max-w-lg">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" className="pl-9" aria-label="Search your files" /></div>
        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {files.loading && <li><Skeleton className="h-12" /></li>}
          {!files.loading && rows.length === 0 && <li className="p-4 text-center text-sm text-muted">No files found.</li>}
          {rows.map((f) => {
            const on = picked.has(f.id);
            return (
              <li key={f.id}>
                <button type="button" aria-pressed={on} onClick={() => setPicked((m) => { const n = new Map(m); if (on) n.delete(f.id); else if (n.size < 10) n.set(f.id, f); return n; })}
                  className={cn("flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-[rgb(var(--line)/0.04)]", on && "bg-accent-soft")}>
                  <TypeIcon category={f.category} mime={f.mime_type} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{f.display_name}</span><span className="block text-xs text-muted">{humanSize(Number(f.size_bytes))}</span></span>
                  <span className={cn("grid h-5 w-5 place-items-center rounded-full border", on ? "border-accent bg-accent text-white" : "hairline")}>{on && <Check className="h-3 w-3" strokeWidth={3} />}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={picked.size === 0} onClick={() => { onPick([...picked.values()]); setPicked(new Map()); onOpenChange(false); }}>Send {picked.size || ""} file{picked.size === 1 ? "" : "s"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
