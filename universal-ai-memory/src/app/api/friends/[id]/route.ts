import { z } from "zod";
import { errors, route } from "@/lib/api";
import { adminOrThrow, audit } from "@/lib/server/context";
import { myFriendship, otherParty } from "@/lib/server/friends";
import { idParams } from "@/lib/validation";
import type { SupabaseClient } from "@supabase/supabase-js";

type P = { id: string };

/** Stops access to every file that was sent inside this chat (both directions). */
async function revokeChatShares(admin: SupabaseClient, friendshipId: string) {
  const { data } = await admin.from("direct_messages").select("share_id").eq("friendship_id", friendshipId).not("share_id", "is", null);
  const ids = [...new Set((data ?? []).map((r) => r.share_id as string))];
  if (ids.length) await admin.from("sharing_permissions").update({ status: "revoked", revoked_at: new Date().toISOString() }).in("id", ids).in("status", ["pending", "accepted"]);
}

const patch = z.object({ action: z.enum(["accept", "decline", "block", "unblock"]) });

export const PATCH = route<z.infer<typeof patch>, undefined, P>({ body: patch, rateLimit: { name: "friend-update", max: 120, windowSeconds: 600 } }, async ({ body, supabase, user, params }) => {
  const { id } = idParams.parse(params);
  const f = await myFriendship(supabase, user.id, id);
  const admin = adminOrThrow();
  const now = new Date().toISOString();
  const other = otherParty(f, user.id);
  switch (body.action) {
    case "accept":
    case "decline": {
      if (f.status !== "pending" || f.addressee_id !== user.id) throw errors.conflict("There's no request to answer here.");
      const { error } = await admin.from("friendships").update({ status: body.action === "accept" ? "accepted" : "declined", responded_at: now }).eq("id", id);
      if (error) throw error;
      await audit(user.id, body.action === "accept" ? "friend.accepted" : "friend.declined", { type: "user", id: other });
      return { ok: true };
    }
    case "block": {
      await revokeChatShares(admin, id);
      const { error } = await admin.from("friendships").update({ status: "blocked", blocked_by: user.id, responded_at: now }).eq("id", id);
      if (error) throw error;
      await audit(user.id, "friend.blocked", { type: "user", id: other });
      return { ok: true };
    }
    case "unblock": {
      if (f.status !== "blocked" || f.blocked_by !== user.id) throw errors.conflict("This person isn't blocked.");
      const { error } = await admin.from("friendships").delete().eq("id", id);
      if (error) throw error;
      return { ok: true };
    }
  }
});

/** Removes a friend (or cancels a request). Files sent in the chat stop being shared; the chat is deleted for both people. */
export const DELETE = route<undefined, undefined, P>({ rateLimit: { name: "friend-update", max: 120, windowSeconds: 600 } }, async ({ supabase, user, params }) => {
  const { id } = idParams.parse(params);
  const f = await myFriendship(supabase, user.id, id);
  if (f.status === "blocked" && f.blocked_by !== user.id) throw errors.notFound("That friend wasn't found.");
  const admin = adminOrThrow();
  await revokeChatShares(admin, id);
  const { error } = await admin.from("friendships").delete().eq("id", id);
  if (error) throw error;
  await audit(user.id, "friend.removed", { type: "user", id: otherParty(f, user.id) });
  return { ok: true };
});
