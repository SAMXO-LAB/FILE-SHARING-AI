import { z } from "zod";
import crypto from "node:crypto";
import { ApiError, errors, route } from "@/lib/api";
import { limits, publicEnv } from "@/lib/env";
import { extensionOf, isBlockedExtension, sanitizeFileName, typeFromName } from "@/lib/files/types";
import { adminOrThrow, audit } from "@/lib/server/context";

const body = z.object({
  name: z.string().min(1).max(1024),
  size: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  mime: z.string().max(200).optional().nullable(),
  folderId: z.uuid().optional().nullable(),
  /** Optional client-computed SHA-256 (small files) used only for a friendly duplicate warning. */
  sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  allowDuplicate: z.boolean().optional(),
  purpose: z.enum(["memory", "import_source"]).default("memory"),
  source: z.enum(["upload", "ai_chat"]).default("upload"),
});

export const POST = route(
  { body, rateLimit: { name: "file-init", max: 300, windowSeconds: 600 } },
  async ({ body, supabase, user }) => {
    const admin = adminOrThrow();
    const name = sanitizeFileName(body.name);
    if (isBlockedExtension(name)) throw errors.badRequest("Executable and script-launcher files aren't accepted.");

    let cap = limits.maxUploadBytes;
    if (body.purpose === "import_source") {
      if (!["txt", "json", "zip"].includes(extensionOf(name))) {
        throw errors.badRequest("Chat exports must be a .txt, .json or .zip file.");
      }
      cap = Math.min(cap, limits.maxImportBytes);
    }
    if (body.size > cap) throw new ApiError(413, "file_too_large", "That file is larger than the upload limit.");

    if (body.sha256 && body.purpose === "memory" && !body.allowDuplicate) {
      const { data: dup } = await supabase
        .from("files")
        .select("id,display_name,created_at")
        .eq("owner_id", user.id)
        .eq("purpose", "memory")
        .eq("content_hash", body.sha256)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (dup) return { duplicate: { id: dup.id, name: dup.display_name, createdAt: dup.created_at } };
    }

    if (body.folderId) {
      const { data: folder } = await supabase.from("folders").select("id").eq("id", body.folderId).eq("owner_id", user.id).maybeSingle();
      if (!folder) throw errors.badRequest("That folder doesn't exist.");
    }

    const info = typeFromName(name, body.mime);
    const id = crypto.randomUUID();
    const { data, error } = await admin.rpc("reserve_file", {
      p_owner: user.id,
      p_file_id: id,
      p_display_name: name,
      p_size: body.size,
      p_declared_mime: body.mime ?? info.mime,
      p_category: info.category,
      p_folder: body.purpose === "memory" ? (body.folderId ?? null) : null,
      p_source_id: body.source,
      p_max_upload_cap: cap,
      p_purpose: body.purpose,
    });
    if (error) throw error;
    const file = data as { id: string; storage_key: string; bucket: string };
    await audit(user.id, "file.upload_started", { type: "file", id: file.id }, { size: body.size, purpose: body.purpose });
    return {
      file: { id: file.id, name, storageKey: file.storage_key, bucket: file.bucket },
      upload: { endpoint: `${publicEnv.supabaseUrl}/storage/v1/upload/resumable`, chunkSize: 6 * 1024 * 1024 },
    };
  },
);
