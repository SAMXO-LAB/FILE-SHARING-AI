import { errors, route } from "@/lib/api";
import { enqueueJob } from "@/lib/processing/jobs";
import { adminOrThrow, kickJobs } from "@/lib/server/context";
import { ownFile } from "@/lib/server/files";
import { idParams } from "@/lib/validation";

export const POST = route<undefined, undefined, { id: string }>({ rateLimit: { name: "file-reprocess", max: 120, windowSeconds: 600 } }, async ({ supabase, user, params }) => {
  const { id } = idParams.parse(params);
  const file = await ownFile(supabase, user.id, id);
  if (file.deleted_at) throw errors.conflict("Restore this file first.");
  if (["uploading", "queued", "processing"].includes(file.status)) throw errors.conflict("This file is already being processed.");
  const admin = adminOrThrow();
  await admin.from("files").update({ status: "queued", status_detail: null }).eq("id", id).eq("owner_id", user.id);
  await enqueueJob(admin, user.id, "process_file", { fileId: id, force: true }, { dedupeKey: `file:${id}` });
  kickJobs();
  return { ok: true };
});
