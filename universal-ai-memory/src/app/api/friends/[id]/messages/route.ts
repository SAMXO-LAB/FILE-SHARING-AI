import { z } from "zod";
import { errors, route } from "@/lib/api";
import { adminOrThrow, audit } from "@/lib/server/context";
import { ownFile } from "@/lib/server/files";
import { myFriendship, otherParty, publicProfiles, type DirectMessageRow } from "@/lib/server/friends";
import { idParams } from "@/lib/validation";

type P = { id: string };
const query = z.object({ before: z.iso.datetime({ offset: true }).optional(), limit: z.coerce.number().int().min(1).max(100).default(60) });

/** A page of the chat (oldest first) with each file's current availability. Marks incoming messages read. */
export const GET = route<undefined, z.infer<typeof query>, P>({ query }, async ({ query: q, supabase, user, params }) => {
  const { id } = idParams.parse(params);
  const f = await myFriendship(supabase, user.id, id);
  if (f.status === "blocked" && f.blocked_by !== user.id) throw errors.notFound("That friend wasn't found.");
  const admin = adminOrThrow();
  const friendId = otherParty(f, user.id);
  const people = await publicProfiles(admin, [friendId]);

  let sel = supabase.from("direct_messages").select("*").eq("friendship_id", id).order("created_at", { ascending: false }).limit(q.limit + 1);
  if (q.before) sel = sel.lt("created_at", q.before);
  const { data, error } = await sel;
  if (error) throw error;
  const rows = (data ?? []) as DirectMessageRow[];
  const hasMore = rows.length > q.limit;
  const page = rows.slice(0, q.limit).reverse();

  const shareIds = page.map((m) => m.share_id).filter((x): x is string => Boolean(x));
  const live = new Set<string>();
  if (shareIds.length) {
    const { data: shares } = await admin.from("sharing_permissions").select("id,status,expires_at").in("id", shareIds);
    const now = Date.now();
    for (const s of shares ?? []) if (s.status === "accepted" && (!s.expires_at || new Date(s.expires_at as string).getTime() > now)) live.add(s.id as string);
  }

  if (page.some((m) => m.recipient_id === user.id && !m.read_at)) {
    await admin.from("direct_messages").update({ read_at: new Date().toISOString() }).eq("friendship_id", id).eq("recipient_id", user.id).is("read_at", null);
  }

  return {
    friendship: { id: f.id, status: f.status, kind: f.status === "accepted" ? "friend" : f.status === "blocked" ? "blocked" : f.addressee_id === user.id ? "incoming" : "outgoing" },
    friend: people.get(friendId) ?? { id: friendId, username: "unknown", displayName: null, avatar: null },
    hasMore,
    messages: page.map((m) => ({
      id: m.id,
      mine: m.sender_id === user.id,
      body: m.body,
      at: m.created_at,
      read: Boolean(m.read_at),
      file: m.file_name ? {
        id: m.file_id, shareId: m.share_id, name: m.file_name, size: m.file_size, category: m.file_category, mime: m.file_mime,
        available: Boolean(m.file_id && m.share_id && live.has(m.share_id)),
      } : null,
    })),
  };
});

const body = z.object({
  body: z.string().trim().max(4000).optional(),
  fileIds: z.array(z.uuid()).max(10).optional(),
}).refine((b) => Boolean(b.body) || (b.fileIds?.length ?? 0) > 0, "Write a message or attach a file.");

/**
 * Sends text and/or files to an accepted friend. Each file is shared through a normal, revocable
 * grant (accepted for them, no expiry), so the friend can open and download it right away.
 */
export const POST = route<z.infer<typeof body>, undefined, P>({ body, rateLimit: { name: "dm-send", max: 300, windowSeconds: 600 } }, async ({ body: b, supabase, user, params }) => {
  const { id } = idParams.parse(params);
  const f = await myFriendship(supabase, user.id, id);
  if (f.status !== "accepted") throw errors.conflict(f.status === "pending" ? "You can send things once your friend request is accepted." : "You can't send messages in this chat.");
  const friendId = otherParty(f, user.id);
  const admin = adminOrThrow();
  const now = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];

  for (const fileId of [...new Set(b.fileIds ?? [])]) {
    const file = await ownFile(supabase, user.id, fileId);
    if (file.deleted_at) throw errors.conflict(`Restore “${file.display_name}” from the trash before sending it.`);
    if (file.status === "uploading") throw errors.conflict(`“${file.display_name}” is still uploading.`);
    const { data: existing } = await admin.from("sharing_permissions").select("id,status")
      .eq("file_id", file.id).eq("recipient_id", friendId).in("status", ["pending", "accepted"]).maybeSingle();
    let shareId = existing?.id as string | undefined;
    if (existing && existing.status === "pending") {
      await admin.from("sharing_permissions").update({ status: "accepted", accepted_at: now }).eq("id", existing.id);
    }
    if (!shareId) {
      const { data: share, error } = await admin.from("sharing_permissions")
        .insert({ owner_id: user.id, file_id: file.id, recipient_id: friendId, status: "accepted", accepted_at: now, can_download: true, note: "Sent in chat" })
        .select("id").single();
      if (error) throw error;
      shareId = share.id as string;
      await audit(user.id, "share.created", { type: "file", id: file.id }, { recipient: friendId, via: "chat" });
    }
    rows.push({ friendship_id: id, sender_id: user.id, recipient_id: friendId, file_id: file.id, share_id: shareId, file_name: file.display_name, file_size: file.size_bytes, file_category: file.category, file_mime: file.mime_type });
  }
  if (b.body) rows.push({ friendship_id: id, sender_id: user.id, recipient_id: friendId, body: b.body });

  // Explicit, increasing timestamps keep the order stable (files first, then the text).
  const t0 = Date.now();
  rows.forEach((r, i) => { r.created_at = new Date(t0 + i).toISOString(); });
  const { data: inserted, error } = await admin.from("direct_messages").insert(rows).select("id");
  if (error) throw error;
  await admin.from("friendships").update({ last_message_at: new Date().toISOString() }).eq("id", id);
  return { sent: inserted?.length ?? 0 };
});
