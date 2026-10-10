import { z } from "zod";
import { errors, route } from "@/lib/api";
import { adminOrThrow, audit } from "@/lib/server/context";
import { friendsDbError, otherParty, profileByUsername, publicProfiles, type DirectMessageRow, type FriendshipRow } from "@/lib/server/friends";

/**
 * Friends list: accepted friends (with last message + unread count), incoming and outgoing requests,
 * and people you've blocked. A request you sent that was declined keeps looking "pending" to you.
 */
export const GET = route({}, async ({ supabase, user }) => {
  const me = user.id;
  const { data, error } = await supabase.from("friendships").select("*").order("last_message_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(500);
  if (error) throw friendsDbError(error);
  const rows = (data ?? []) as FriendshipRow[];
  const visible = rows.filter((f) =>
    f.status === "accepted" ||
    (f.status === "pending") ||
    (f.status === "declined" && f.requester_id === me) ||
    (f.status === "blocked" && f.blocked_by === me));
  const admin = adminOrThrow();
  const people = await publicProfiles(admin, visible.map((f) => otherParty(f, me)));

  const accepted = visible.filter((f) => f.status === "accepted").map((f) => f.id);
  const last = new Map<string, DirectMessageRow>();
  const unread = new Map<string, number>();
  if (accepted.length) {
    const [{ data: recent }, { data: unreadRows }] = await Promise.all([
      supabase.from("direct_messages").select("*").in("friendship_id", accepted).order("created_at", { ascending: false }).limit(600),
      supabase.from("direct_messages").select("friendship_id").eq("recipient_id", me).is("read_at", null).limit(2000),
    ]);
    for (const m of (recent ?? []) as DirectMessageRow[]) if (!last.has(m.friendship_id)) last.set(m.friendship_id, m);
    for (const r of (unreadRows ?? []) as { friendship_id: string }[]) unread.set(r.friendship_id, (unread.get(r.friendship_id) ?? 0) + 1);
  }

  const friends = visible.map((f) => {
    const other = people.get(otherParty(f, me));
    const kind = f.status === "accepted" ? "friend" : f.status === "blocked" ? "blocked" : f.addressee_id === me ? "incoming" : "outgoing";
    const lm = last.get(f.id);
    return {
      id: f.id,
      kind,
      since: f.responded_at ?? f.created_at,
      user: other ?? { id: otherParty(f, me), username: "unknown", displayName: null, avatar: null },
      lastMessage: lm ? { at: lm.created_at, mine: lm.sender_id === me, text: lm.body ?? (lm.file_name ? `📎 ${lm.file_name}` : "") } : null,
      unread: unread.get(f.id) ?? 0,
    };
  });

  return {
    friends,
    totals: { unread: [...unread.values()].reduce((a, b) => a + b, 0), incoming: friends.filter((f) => f.kind === "incoming").length },
  };
});

const body = z.object({ username: z.string().trim().transform((v) => v.replace(/^@/, "")).pipe(z.string().regex(/^[a-zA-Z0-9_]{3,30}$/, "Usernames are 3–30 letters, numbers or underscores.")) });

/** Sends a friend request by username (or accepts theirs if they already asked you). */
export const POST = route({ body, rateLimit: { name: "friend-request", max: 30, windowSeconds: 3600 } }, async ({ body, user }) => {
  const admin = adminOrThrow();
  const target = await profileByUsername(admin, body.username);
  if (!target) throw errors.notFound("No Share Files AI account has that username. Ask your friend for their exact username.");
  if (target.id === user.id) throw errors.badRequest("That's your own username.");

  const { data: existingRows, error: exErr } = await admin.from("friendships").select("*")
    .or(`and(requester_id.eq.${user.id},addressee_id.eq.${target.id}),and(requester_id.eq.${target.id},addressee_id.eq.${user.id})`).limit(1);
  if (exErr) throw friendsDbError(exErr);
  const existing = (existingRows?.[0] ?? null) as FriendshipRow | null;
  const now = new Date().toISOString();

  if (!existing) {
    const { data, error } = await admin.from("friendships").insert({ requester_id: user.id, addressee_id: target.id }).select("id").single();
    if (error) throw error;
    await audit(user.id, "friend.requested", { type: "user", id: target.id });
    return { id: data.id, status: "requested", username: target.username };
  }
  if (existing.status === "accepted") throw errors.conflict(`You and @${target.username} are already friends.`);
  if (existing.status === "blocked") {
    if (existing.blocked_by === user.id) throw errors.conflict(`You blocked @${target.username}. Unblock them first.`);
    return { id: existing.id, status: "requested", username: target.username }; // never reveal a block
  }
  if (existing.status === "pending" && existing.addressee_id === user.id) {
    const { error } = await admin.from("friendships").update({ status: "accepted", responded_at: now }).eq("id", existing.id);
    if (error) throw error;
    await audit(user.id, "friend.accepted", { type: "user", id: target.id });
    return { id: existing.id, status: "accepted", username: target.username };
  }
  if (existing.status === "pending") return { id: existing.id, status: "requested", username: target.username };
  // Declined earlier: the person who declined may ask again; the one who was declined just sees "requested".
  if (existing.requester_id === user.id) return { id: existing.id, status: "requested", username: target.username };
  const { error } = await admin.from("friendships").update({ requester_id: user.id, addressee_id: target.id, status: "pending", created_at: now, responded_at: null }).eq("id", existing.id);
  if (error) throw error;
  return { id: existing.id, status: "requested", username: target.username };
});
