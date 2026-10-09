import { z } from "zod";
import { errors, route } from "@/lib/api";
import { enqueueJob } from "@/lib/processing/jobs";
import { adminOrThrow, audit, kickJobs } from "@/lib/server/context";

const body = z.object({
  fileId: z.uuid(),
  kind: z.enum(["whatsapp_export", "telegram_export"]),
  title: z.string().trim().max(120).optional(),
  tzOffsetMinutes: z.number().int().min(-840).max(840).optional(),
  dateOrder: z.enum(["auto", "dmy", "mdy", "ymd"]).default("auto"),
});

/** Starts importing a chat export that was uploaded with purpose "import_source". */
export const POST = route({ body, rateLimit: { name: "import-start", max: 20, windowSeconds: 3600 } }, async ({ body, supabase, user }) => {
  const admin = adminOrThrow();
  const { data: file } = await supabase.from("files").select("id,display_name,status,purpose").eq("id", body.fileId).eq("owner_id", user.id).maybeSingle();
  if (!file || file.purpose !== "import_source") throw errors.notFound("That upload wasn't found. Upload the export again.");
  if (file.status !== "uploaded") throw errors.conflict("That file hasn't finished uploading.");

  const { data: existing } = await admin.from("import_batches").select("id").eq("file_id", body.fileId).maybeSingle();
  if (existing) throw errors.conflict("That export is already being imported.");

  const sourceId = body.kind === "whatsapp_export" ? "whatsapp" : "telegram";
  const label = body.kind === "whatsapp_export" ? "WhatsApp export" : "Telegram export";
  let { data: conn } = await admin.from("source_connections").select("id").eq("owner_id", user.id).eq("kind", body.kind).maybeSingle();
  if (!conn) {
    const ins = await admin
      .from("source_connections")
      .insert({ owner_id: user.id, source_id: sourceId, kind: body.kind, status: "connected", display_name: label, permissions: ["user_supplied_export"] })
      .select("id").single();
    if (ins.error) throw ins.error;
    conn = ins.data;
  }

  const { data: batch, error } = await admin
    .from("import_batches")
    .insert({ owner_id: user.id, connection_id: conn.id, source_id: sourceId, kind: body.kind, status: "pending", file_id: body.fileId, display_name: file.display_name })
    .select("*").single();
  if (error) throw error;

  await enqueueJob(admin, user.id, "process_import", {
    batchId: batch.id,
    options: { title: body.title, tzOffsetMinutes: body.tzOffsetMinutes, dateOrder: body.dateOrder },
  }, { dedupeKey: `import:${batch.id}`, maxAttempts: 2 });
  await audit(user.id, "import.started", { type: "import_batch", id: batch.id }, { kind: body.kind });
  kickJobs(50_000);
  return { batch };
});
