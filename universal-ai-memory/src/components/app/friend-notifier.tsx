"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client/api";
import { getNotifySettings, playPing, showDesktop } from "@/lib/client/notify";
import { friendName, type FriendEntry, type FriendsResponse } from "./friends-shared";

export const FRIENDS_TOTALS = "memory:friends-totals";
interface Snap { lastId: string | null; read: boolean; unread: number; kind: FriendEntry["kind"] }

/**
 * Watches for new messages, files and friend activity while the app is open: pop-ups in the app,
 * system notifications when the tab is in the background, and the sidebar badge count.
 */
export function FriendNotifier() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const viewing = useRef<string | null>(null);
  useEffect(() => { viewing.current = pathname === "/friends" ? params.get("f") : null; }, [pathname, params]);
  const prev = useRef<Map<string, Snap> | null>(null);

  useEffect(() => {
    let alive = true;
    let busy = false;
    const open = (id: string) => router.push(`/friends?f=${id}`);

    async function check() {
      if (busy) return;
      busy = true;
      try {
        const r = await api<FriendsResponse>("/api/friends");
        if (!alive) return;
        window.dispatchEvent(new CustomEvent(FRIENDS_TOTALS, { detail: r.totals }));
        const next = new Map<string, Snap>(r.friends.map((f) => [f.id, { lastId: f.lastMessage?.id ?? null, read: Boolean(f.lastMessage?.read), unread: f.unread, kind: f.kind }]));
        const before = prev.current;
        prev.current = next;
        const s = getNotifySettings();

        if (!before) {
          // First look after opening the app: one gentle summary instead of a pop-up per message.
          const unread = r.totals.unread;
          if (unread > 0 && s.popups && !window.location.pathname.startsWith("/friends")) {
            toast(`You have ${unread} unread message${unread === 1 ? "" : "s"}`, { action: { label: "Open", onClick: () => router.push("/friends") } });
          }
          return;
        }

        for (const f of r.friends) {
          const old = before.get(f.id);
          const name = friendName(f.user);
          const lm = f.lastMessage;
          const lookingAtIt = viewing.current === f.id && document.visibilityState === "visible";

          if (f.kind === "incoming" && !old) {
            notify(`${name} wants to be friends`, `@${f.user.username} sent you a friend request.`, f.id, () => router.push("/friends"));
            continue;
          }
          if (f.kind === "friend" && old?.kind === "outgoing") {
            notify(`${name} accepted your friend request`, "You can now chat and send files.", f.id, () => open(f.id));
            continue;
          }
          if (!lm) continue;
          // Something new arrived from them.
          if (!lm.mine && lm.id !== old?.lastId && f.unread > (old?.unread ?? 0) && !lookingAtIt) {
            const extra = f.unread - (old?.unread ?? 0);
            const title = lm.file ? `${name} sent you a file` : `New message from ${name}`;
            const body = lm.file ? `${lm.file}${extra > 1 ? ` and ${extra - 1} more` : ""}` : lm.text;
            notify(title, body, f.id, () => open(f.id), "receive");
            continue;
          }
          // They opened what you sent.
          if (lm.mine && lm.file && lm.read && old?.lastId === lm.id && !old.read && !lookingAtIt) {
            notify(`${name} received your file`, `${lm.file} was delivered and seen.`, f.id, () => open(f.id), "send");
          }
        }
      } catch {
        /* offline, signed out, or Friends not set up yet: try again on the next tick */
      } finally {
        busy = false;
      }

      function notify(title: string, body: string, id: string, onOpen: () => void, sound?: "receive" | "send") {
        const s = getNotifySettings();
        const shownAsSystem = showDesktop(title, body, { tag: `friend-${id}`, onClick: onOpen });
        if (s.popups && !shownAsSystem) toast(title, { description: body, action: { label: "Open", onClick: onOpen } });
        if (sound) playPing(sound);
      }
    }

    void check();
    const t = setInterval(() => { if (document.visibilityState === "visible" || getNotifySettings().desktop) void check(); }, 10_000);
    const onChange = () => void check();
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    window.addEventListener("memory:friends-changed", onChange);
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; clearInterval(t); window.removeEventListener("memory:friends-changed", onChange); document.removeEventListener("visibilitychange", onVisible); };
  }, [router]);

  return null;
}
