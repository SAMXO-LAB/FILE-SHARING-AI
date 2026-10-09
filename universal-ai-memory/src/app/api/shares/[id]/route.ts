import { errors, must, route } from "@/lib/api";
import { adminOrThrow, audit } from "@/lib/server/context";
import { idParams } from "@/lib/validation";

/**
 * Revokes a share. The owner can revoke any time; the recipient can drop an accepted share.
 * Revocation stops hosted access immediately; it can't remove a copy someone already downloaded.
 */
export const DELETE = route<undefined, undefined, { id: string }>({ rateLimit: { name: "share-revoke", max: 120, windowSeconds: 600 } }, async ({ supabase, user, params }) => {
  const { id } = idParams.parse(params);
  const { data } = await supabase.from("sharing_permissions").select("id,status,owner_id,recipient_id,file_id").eq("id", id).maybeSingle(); // RLS: parties only
  const share = must(data);
  if (!["pending", "accepted"].includes(share.status as string)) throw errors.conflict("This share is no longer active.");
  const { error } = await adminOrThrow().from("sharing_permissions").update({ status: "revoked", revoked_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  await audit(user.id, "share.revoked", { type: "file", id: share.file_id as string }, { by: share.owner_id === user.id ? "owner" : "recipient", owner: share.owner_id, recipient: share.recipient_id });
  return { ok: true };
});
