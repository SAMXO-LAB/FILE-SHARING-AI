import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueJob } from "@/lib/processing/jobs";
import { isBlockedExtension, typeFromName, categoryFromMime } from "@/lib/files/types";
import { mimeCompatible, sniff } from "@/lib/security/mime";
import { objectSize, readHead, removeObjects } from "@/lib/storage/objects";
import type { FileRow } from "@/lib/types";

export type FinalizeResult =
  | { ok: true; file: FileRow }
  | { ok: false; code: "incomplete" | "too_large" | "quota" | "blocked" | "executable"; message: string };

async function reject(admin: SupabaseClient, file: FileRow, code: Exclude<FinalizeResult, { ok: true }>["code"], message: string): Promise<FinalizeResult> {
  await removeObjects(admin, [file.storage_key]).catch(() => {});
  await admin.from("files").delete().eq("id", file.id).eq("owner_id", file.owner_id);
  return { ok: false, code, message };
}

/**
 * Server-side verification that runs after bytes have landed in storage (client upload or server import):
 *  - the object really exists and its REAL size is checked against the per-file limit and the quota
 *  - the content is sniffed; executables are refused; the browser-declared type is never trusted
 *  - the file is queued for processing
 */
export async function finalizeUpload(admin: SupabaseClient, file: FileRow, head?: Uint8Array): Promise<FinalizeResult> {
  const info = await objectSize(admin, file.storage_key);
  if (!info || (info.size <= 0 && file.size_bytes > 0)) {
    return { ok: false, code: "incomplete", message: "The upload didn't finish. Please try again." };
  }

  const { data: prof } = await admin.from("profiles").select("max_upload_bytes,storage_quota_bytes").eq("id", file.owner_id).single();
  if (prof && info.size > Number(prof.max_upload_bytes)) {
    return reject(admin, file, "too_large", "That file is larger than your per-file upload limit.");
  }
  if (prof) {
    const { data: others } = await admin.from("files").select("size_bytes").eq("owner_id", file.owner_id).neq("id", file.id);
    const used = (others ?? []).reduce((n, r: { size_bytes: number }) => n + Number(r.size_bytes), 0);
    if (used + info.size > Number(prof.storage_quota_bytes)) {
      return reject(admin, file, "quota", "Not enough storage left for this file.");
    }
  }

  if (isBlockedExtension(file.display_name)) {
    return reject(admin, file, "blocked", "Executable and script-launcher files aren't accepted.");
  }

  const bytes = head ?? (await readHead(admin, file.storage_key, 4096));
  const sniffed = sniff(bytes);
  if (sniffed.executable) {
    return reject(admin, file, "executable", "This file looks like a program, which isn't accepted.");
  }

  if (file.purpose === "import_source") {
    // Chat exports are parsed by the importer, never indexed as documents.
    if (!["text/plain", "application/json", "application/zip"].includes(sniffed.mime ?? "")) {
      return reject(admin, file, "blocked", "Import files must be a .txt, .json or .zip chat export.");
    }
    const { data: src, error: srcErr } = await admin
      .from("files")
      .update({ size_bytes: info.size, mime_type: sniffed.mime, status: "uploaded", status_detail: "Waiting to be imported." })
      .eq("id", file.id).eq("owner_id", file.owner_id).select("*").single();
    if (srcErr || !src) throw new Error(`Could not finish the upload (${srcErr?.message ?? "unknown"}).`);
    return { ok: true, file: src as FileRow };
  }

  const expected = typeFromName(file.display_name, file.declared_mime);
  let mime = expected.mime;
  let detail: string | null = null;
  if (!mimeCompatible(expected.mime, sniffed)) {
    mime = sniffed.mime ?? "application/octet-stream";
    detail = `The file's contents don't match its “${file.display_name.split(".").pop()}” extension; it was treated as ${mime}.`;
  }
  const category = mimeCompatible(expected.mime, sniffed) ? expected.category : categoryFromMime(mime);

  const { data: updated, error } = await admin
    .from("files")
    .update({ size_bytes: info.size, mime_type: mime, category, status: "queued", status_detail: detail })
    .eq("id", file.id)
    .eq("owner_id", file.owner_id)
    .select("*")
    .single();
  if (error || !updated) throw new Error(`Could not finish the upload (${error?.message ?? "unknown"}).`);

  await enqueueJob(admin, file.owner_id, "process_file", { fileId: file.id }, { dedupeKey: `file:${file.id}` });
  return { ok: true, file: updated as FileRow };
}
