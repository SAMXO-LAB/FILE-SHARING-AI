import { route } from "@/lib/api";
import { enqueueJob } from "@/lib/processing/jobs";
import { adminOrThrow, audit, kickJobs } from "@/lib/server/context";

/** Re-runs processing for every ready file (e.g. after changing your privacy mode or AI settings). */
export const POST = route({ rateLimit: { name: "reindex-all", max: 3, windowSeconds: 3600 } }, async ({ supabase, user }) => {
  const admin = adminOrThrow();
  const { data, error } = await supabase
    .from("files").select("id").eq("owner_id", user.id).eq("purpose", "memory").is("deleted_at", null).in("status", ["ready", "failed", "unsupported"]).limit(5000);
  if (error) throw error;
  const ids = (data ?? []).map((r) => r.id as string);
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    await admin.from("files").update({ status: "queued", status_detail: null }).eq("owner_id", user.id).in("id", batch);
    for (const id of batch) await enqueueJob(admin, user.id, "process_file", { fileId: id, force: true }, { dedupeKey: `file:${id}` });
  }
  await audit(user.id, "files.reindex_all", { type: "profile", id: user.id }, { count: ids.length });
  kickJobs();
  return { queued: ids.length };
});
