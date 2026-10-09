import "server-only";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { limits } from "@/lib/env";
import { finalizeUpload } from "@/lib/files/finalize";
import { isBlockedExtension, sanitizeFileName, typeFromName } from "@/lib/files/types";
import { uploadBytes, BUCKET } from "@/lib/storage/objects";
import type { FileRow } from "@/lib/types";

export interface CreateFileInput {
  ownerId: string;
  name: string;
  bytes: Uint8Array;
  sourceId: "upload" | "whatsapp" | "telegram" | "ai_chat";
  folderId?: string | null;
  conversationId?: string | null;
  importBatchId?: string | null;
  senderLabel?: string | null;
  originalDate?: Date | null;
  declaredMime?: string | null;
}

export type CreateFileResult =
  | { ok: true; file: FileRow }
  | { ok: false; reason: "blocked" | "too_large" | "quota" | "error"; message: string };

/** Server-side file creation for imports and bot messages: same quota, sniffing and queueing as browser uploads. */
export async function createFileFromBytes(admin: SupabaseClient, input: CreateFileInput): Promise<CreateFileResult> {
  const name = sanitizeFileName(input.name);
  if (isBlockedExtension(name)) return { ok: false, reason: "blocked", message: `${name}: executable files aren't accepted.` };
  const info = typeFromName(name, input.declaredMime);
  const id = crypto.randomUUID();

  const { data, error } = await admin.rpc("reserve_file", {
    p_owner: input.ownerId,
    p_file_id: id,
    p_display_name: name,
    p_size: input.bytes.byteLength,
    p_declared_mime: input.declaredMime ?? info.mime,
    p_category: info.category,
    p_folder: input.folderId ?? null,
    p_source_id: input.sourceId,
    p_max_upload_cap: limits.maxUploadBytes,
  });
  if (error) {
    if (error.message.includes("quota_exceeded")) return { ok: false, reason: "quota", message: "Your storage is full." };
    if (error.message.includes("file_too_large")) return { ok: false, reason: "too_large", message: `${name} is larger than the upload limit.` };
    return { ok: false, reason: "error", message: error.message };
  }
  const reserved = data as FileRow;

  try {
    await uploadBytes(admin, reserved.storage_key, input.bytes, info.mime);
  } catch (e) {
    await admin.from("files").delete().eq("id", reserved.id);
    return { ok: false, reason: "error", message: (e as Error).message };
  }

  await admin
    .from("files")
    .update({
      conversation_id: input.conversationId ?? null,
      import_batch_id: input.importBatchId ?? null,
      sender_label: input.senderLabel ?? null,
      original_date: input.originalDate?.toISOString() ?? null,
    })
    .eq("id", reserved.id);

  const fresh = { ...reserved, conversation_id: input.conversationId ?? null, import_batch_id: input.importBatchId ?? null };
  const res = await finalizeUpload(admin, fresh as FileRow, input.bytes.subarray(0, 4096));
  if (!res.ok) {
    return { ok: false, reason: res.code === "quota" ? "quota" : res.code === "too_large" ? "too_large" : "blocked", message: `${name}: ${res.message}` };
  }
  return { ok: true, file: res.file };
}

export { BUCKET };
