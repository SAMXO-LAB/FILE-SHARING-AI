import { z } from "zod";
import { errors, route } from "@/lib/api";
import { limits } from "@/lib/env";
import { previewKind } from "@/lib/files/types";
import { adminOrThrow, audit } from "@/lib/server/context";
import { downloadObject, readHead, signedUrl } from "@/lib/storage/objects";
import type { FileRow } from "@/lib/types";
import { idParams } from "@/lib/validation";

const query = z.object({ mode: z.enum(["preview", "download", "text", "extracted"]).default("preview") });

/**
 * Short-lived access to a file's bytes. The caller must be the owner or hold a live, accepted,
 * unexpired share. Storage itself is private: this is the only way a browser gets a URL.
 */
export const GET = route<undefined, z.infer<typeof query>, { id: string }>(
  { query, rateLimit: { name: "file-url", max: 600, windowSeconds: 600 } },
  async ({ query, supabase, user, params }) => {
    const { id } = idParams.parse(params);
    const { data } = await supabase.from("files").select("*").eq("id", id).maybeSingle(); // RLS: owner or live share
    const file = data as FileRow | null;
    if (!file || file.purpose !== "memory") throw errors.notFound();
    if (file.status === "uploading") throw errors.conflict("This file hasn't finished uploading.");

    const isOwner = file.owner_id === user.id;
    if (!isOwner) {
      const { data: share } = await supabase
        .from("sharing_permissions")
        .select("can_download,expires_at,status")
        .eq("file_id", id).eq("recipient_id", user.id).eq("status", "accepted")
        .maybeSingle();
      const live = share && (!share.expires_at || new Date(share.expires_at).getTime() > Date.now());
      if (!live) throw errors.notFound();
      if ((query.mode === "download" || query.mode === "extracted") && !share.can_download) throw errors.forbidden("The owner shared this file for viewing only.");
    } else if (file.deleted_at && query.mode === "download") {
      throw errors.conflict("Restore this file from the trash to download it.");
    }

    const admin = adminOrThrow();
    const kind = previewKind(file.mime_type, file.category);

    if (query.mode === "extracted") {
      if (!file.extracted_text_key) throw errors.notFound("No extracted text is available for this file.");
      const raw = await downloadObject(admin, file.extracted_text_key);
      const parsed = JSON.parse(new TextDecoder().decode(raw)) as { pages?: { page: number | null; text: string }[]; label?: string };
      const maxChars = 60_000;
      let used = 0;
      const pages: { page: number | null; text: string }[] = [];
      let truncated = false;
      for (const p of parsed.pages ?? []) {
        if (used >= maxChars) { truncated = true; break; }
        const text = p.text.slice(0, maxChars - used);
        used += text.length;
        if (text.length < p.text.length) truncated = true;
        pages.push({ page: p.page, text });
      }
      return { pages, label: parsed.label ?? null, truncated };
    }

    if (query.mode === "text") {
      if (kind !== "text") throw errors.badRequest("This file type can't be previewed as text.");
      const maxBytes = 200_000;
      const head = await readHead(admin, file.storage_key, maxBytes);
      return { text: new TextDecoder("utf-8", { fatal: false }).decode(head), truncated: file.size_bytes > maxBytes };
    }
    if (query.mode === "preview" && !kind) throw errors.badRequest("There's no in-app preview for this file type. You can download it instead.");

    const url = await signedUrl(admin, file.storage_key, limits.signedUrlSeconds, query.mode === "download" ? { download: file.display_name } : {});
    if (isOwner) {
      await supabase.from("files").update({ last_accessed_at: new Date().toISOString() }).eq("id", id).eq("owner_id", user.id);
    } else if (query.mode === "download") {
      await audit(user.id, "share.file_downloaded", { type: "file", id }, { owner: file.owner_id });
    } else {
      await audit(user.id, "share.file_viewed", { type: "file", id }, { owner: file.owner_id });
    }
    return { url, expiresInSeconds: limits.signedUrlSeconds, kind, mime: file.mime_type, name: file.display_name };
  },
);
