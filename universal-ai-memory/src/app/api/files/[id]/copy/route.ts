import { z } from "zod";
import crypto from "node:crypto";
import { errors, route } from "@/lib/api";
import { finalizeUpload } from "@/lib/files/finalize";
import { sanitizeFileName } from "@/lib/files/types";
import { copyObject, removeObjects } from "@/lib/storage/objects";
import { adminOrThrow, audit, kickJobs } from "@/lib/server/context";
import { ownFile } from "@/lib/server/files";
import type { FileRow } from "@/lib/types";
import { idParams } from "@/lib/validation";

const body = z.object({ folderId: z.uuid().nullable().optional(), name: z.string().min(1).max(255).optional() });

/** Copy = a new, independent file (counts toward quota) — as opposed to move, which only changes the folder. */
export const POST = route<z.infer<typeof body>, undefined, { id: string }>(
  { body, rateLimit: { name: "file-copy", max: 60, windowSeconds: 600 } },
  async ({ body, supabase, user, params }) => {
    const { id } = idParams.parse(params);
    const src = await ownFile(supabase, user.id, id);
    if (src.status === "uploading" || src.deleted_at) throw errors.conflict("This file can't be copied right now.");
    const admin = adminOrThrow();

    const dot = src.display_name.lastIndexOf(".");
    const base = dot > 0 ? src.display_name.slice(0, dot) : src.display_name;
    const ext = dot > 0 ? src.display_name.slice(dot) : "";
    const name = sanitizeFileName(body.name ?? `${base} (copy)${ext}`);
    const folder = body.folderId === undefined ? src.folder_id : body.folderId;

    const newId = crypto.randomUUID();
    const { data, error } = await admin.rpc("reserve_file", {
      p_owner: user.id, p_file_id: newId, p_display_name: name, p_size: src.size_bytes, p_declared_mime: src.declared_mime,
      p_category: src.category, p_folder: folder, p_source_id: "upload", p_max_upload_cap: null, p_purpose: "memory",
    });
    if (error) throw error;
    const reserved = data as FileRow;
    try {
      await copyObject(admin, src.storage_key, reserved.storage_key);
    } catch (e) {
      await admin.from("files").delete().eq("id", newId);
      throw e;
    }
    await admin.from("files").update({ tags: src.tags, description: src.description, original_date: src.original_date }).eq("id", newId);
    const res = await finalizeUpload(admin, { ...reserved, declared_mime: src.declared_mime } as FileRow);
    if (!res.ok) {
      await removeObjects(admin, [reserved.storage_key]).catch(() => {});
      throw errors.badRequest(res.message);
    }
    await audit(user.id, "file.copied", { type: "file", id: newId }, { from: id });
    kickJobs();
    return { file: res.file };
  },
);
