import { z } from "zod";
import { errors, route } from "@/lib/api";
import { listOwnerObjects, removeObjects } from "@/lib/storage/objects";
import { adminOrThrow, audit } from "@/lib/server/context";

const body = z.object({ confirmUsername: z.string().min(1).max(60) });

/**
 * Permanently deletes the account: stored files first (so nothing is orphaned), then the auth user,
 * which cascades to every row owned by the account. If file deletion fails the account is kept.
 */
export const POST = route({ body, rateLimit: { name: "account-delete", max: 3, windowSeconds: 3600 } }, async ({ body, supabase, user }) => {
  const { data: profile } = await supabase.from("profiles").select("username").eq("id", user.id).single();
  if (!profile || profile.username.toLowerCase() !== body.confirmUsername.trim().toLowerCase()) {
    throw errors.badRequest("Type your username exactly to confirm.");
  }
  const admin = adminOrThrow();
  const keys = await listOwnerObjects(admin, user.id);
  await removeObjects(admin, keys);
  await audit(user.id, "account.deleted", { type: "profile", id: user.id }, { files: keys.length });
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw new Error(`Could not delete the account (${error.message}).`);
  await supabase.auth.signOut().catch(() => {});
  return { ok: true };
});
