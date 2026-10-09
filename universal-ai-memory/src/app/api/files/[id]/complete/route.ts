import { errors, route } from "@/lib/api";
import { adminOrThrow, audit, kickJobs } from "@/lib/server/context";
import { finalizeUpload } from "@/lib/files/finalize";
import type { FileRow } from "@/lib/types";
import { idParams } from "@/lib/validation";

export const POST = route<undefined, undefined, { id: string }>({ rateLimit: { name: "file-complete", max: 600, windowSeconds: 600 } }, async ({ supabase, user, params }) => {
  const { id } = idParams.parse(params);
  const admin = adminOrThrow();
  const { data } = await supabase.from("files").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!data) throw errors.notFound();
  const file = data as FileRow;
  if (file.status !== "uploading") {
    // Idempotent: a retried "complete" returns the current state.
    return { file };
  }
  const result = await finalizeUpload(admin, file);
  if (!result.ok) {
    await audit(user.id, "file.upload_rejected", { type: "file", id }, { code: result.code });
    return Response.json({ error: { code: result.code, message: result.message } }, { status: result.code === "incomplete" ? 409 : 422, headers: { "Cache-Control": "private, no-store" } });
  }
  await audit(user.id, "file.uploaded", { type: "file", id }, { size: result.file.size_bytes, purpose: result.file.purpose });
  if (result.file.purpose === "memory") kickJobs();
  return { file: result.file };
});
