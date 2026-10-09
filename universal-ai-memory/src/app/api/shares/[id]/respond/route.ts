import { z } from "zod";
import { errors, must, route } from "@/lib/api";
import { adminOrThrow, audit } from "@/lib/server/context";
import { idParams } from "@/lib/validation";

const body = z.object({ action: z.enum(["accept", "decline"]) });

/** The recipient decides. Nothing is accessible until they accept. */
export const POST = route<z.infer<typeof body>, undefined, { id: string }>({ body, rateLimit: { name: "share-respond", max: 60, windowSeconds: 600 } }, async ({ body, supabase, user, params }) => {
  const { id } = idParams.parse(params);
  const { data } = await supabase.from("sharing_permissions").select("id,status,expires_at,owner_id,file_id").eq("id", id).eq("recipient_id", user.id).maybeSingle();
  const share = must(data);
  if (share.status !== "pending") throw errors.conflict("This invitation has already been answered.");
  if (share.expires_at && new Date(share.expires_at as string).getTime() <= Date.now()) throw errors.conflict("This invitation has expired.");
  const patch = body.action === "accept" ? { status: "accepted", accepted_at: new Date().toISOString() } : { status: "declined" };
  const { error } = await adminOrThrow().from("sharing_permissions").update(patch).eq("id", id).eq("recipient_id", user.id).eq("status", "pending");
  if (error) throw error;
  await audit(user.id, body.action === "accept" ? "share.accepted" : "share.declined", { type: "file", id: share.file_id as string }, { owner: share.owner_id });
  return { ok: true, status: patch.status };
});
