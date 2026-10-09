import { errors, must, route } from "@/lib/api";
import { enqueueJob } from "@/lib/processing/jobs";
import { adminOrThrow, kickJobs } from "@/lib/server/context";
import { idParams } from "@/lib/validation";

export const POST = route<undefined, undefined, { id: string }>({ rateLimit: { name: "link-retry", max: 60, windowSeconds: 600 } }, async ({ supabase, user, params }) => {
  const { id } = idParams.parse(params);
  const { data } = await supabase.from("links").select("id,status").eq("id", id).eq("owner_id", user.id).maybeSingle();
  const link = must(data);
  if (link.status === "queued" || link.status === "fetching") throw errors.conflict("This link is already being fetched.");
  const admin = adminOrThrow();
  await admin.from("links").update({ status: "queued", status_detail: null }).eq("id", id);
  await enqueueJob(admin, user.id, "process_link", { linkId: id }, { dedupeKey: `link:${id}` });
  kickJobs();
  return { ok: true };
});
