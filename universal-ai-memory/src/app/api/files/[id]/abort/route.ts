import { errors, route } from "@/lib/api";
import { purgeFiles } from "@/lib/processing/pipeline";
import { adminOrThrow } from "@/lib/server/context";
import { idParams } from "@/lib/validation";

/** Cancels an upload that never finished: removes the reservation and any partial object. */
export const POST = route<undefined, undefined, { id: string }>({}, async ({ supabase, user, params }) => {
  const { id } = idParams.parse(params);
  const { data } = await supabase.from("files").select("id,status").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!data) return { ok: true };
  if (data.status !== "uploading") throw errors.conflict("That upload has already finished.");
  try {
    await purgeFiles(adminOrThrow(), user.id, [id]);
  } catch {
    // A partial object may not exist yet; the row is removed regardless.
    await adminOrThrow().from("files").delete().eq("id", id).eq("owner_id", user.id).eq("status", "uploading");
  }
  return { ok: true };
});
