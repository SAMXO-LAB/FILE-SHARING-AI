import { z } from "zod";
import { errors, route } from "@/lib/api";
import { isBlockedExtension, sanitizeFileName } from "@/lib/files/types";
import { purgeFiles } from "@/lib/processing/pipeline";
import { adminOrThrow, audit } from "@/lib/server/context";
import { cleanTags, ownFile } from "@/lib/server/files";
import { idParams } from "@/lib/validation";

type P = { id: string };

export const GET = route<undefined, undefined, P>({}, async ({ supabase, user, params }) => {
  const { id } = idParams.parse(params);
  // RLS allows owners and live-share recipients; non-owners get a reduced view.
  const { data, error } = await supabase.from("files").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw errors.notFound();
  if (data.purpose !== "memory") throw errors.notFound();
  if (data.owner_id !== user.id) {
    const { data: shareRow } = await supabase
      .from("sharing_permissions")
      .select("id,can_download,expires_at,note,owner_id")
      .eq("file_id", id).eq("recipient_id", user.id).eq("status", "accepted")
      .maybeSingle();
    const share = shareRow && (!shareRow.expires_at || new Date(shareRow.expires_at).getTime() > Date.now()) ? shareRow : null;
    if (!share) throw errors.notFound();
    // Only reached for a verified live share; the owner's username is the only identity detail disclosed.
    const { data: ownerRow } = share ? await adminOrThrow().from("profiles").select("username").eq("id", data.owner_id).maybeSingle() : { data: null };
    const owner = ownerRow?.username ?? null;
    return {
      file: {
        id: data.id, display_name: data.display_name, mime_type: data.mime_type, category: data.category, size_bytes: data.size_bytes,
        created_at: data.created_at, status: data.status, ai_metadata: data.ai_metadata, page_count: data.page_count,
      },
      shared: { canDownload: share.can_download, expiresAt: share.expires_at, note: share.note, owner },
    };
  }
  const [{ data: collections }, { data: share }] = await Promise.all([
    supabase.from("collection_items").select("collection_id, collections(id,name,color)").eq("file_id", id),
    supabase.from("sharing_permissions").select("id,recipient_id,status,can_download,expires_at,created_at").eq("file_id", id).in("status", ["pending", "accepted"]),
  ]);
  return { file: data, collections: (collections ?? []).map((c: any) => c.collections).filter(Boolean), shares: share ?? [] };
});

const patch = z
  .object({
    name: z.string().min(1).max(255),
    folderId: z.uuid().nullable(),
    tags: z.array(z.string().max(60)).max(30),
    description: z.string().max(2000).nullable(),
    starred: z.boolean(),
  })
  .partial()
  .strict();

export const PATCH = route<z.infer<typeof patch>, undefined, P>({ body: patch }, async ({ body, supabase, user, params }) => {
  const { id } = idParams.parse(params);
  const file = await ownFile(supabase, user.id, id);
  const update: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = sanitizeFileName(body.name);
    if (isBlockedExtension(name)) throw errors.badRequest("That file name isn't allowed.");
    update.display_name = name;
  }
  if (body.folderId !== undefined) update.folder_id = body.folderId;
  if (body.tags !== undefined) update.tags = cleanTags(body.tags);
  if (body.description !== undefined) update.description = body.description?.trim() || null;
  if (body.starred !== undefined) update.starred = body.starred;
  if (Object.keys(update).length === 0) throw errors.badRequest("Nothing to update.");
  if (file.deleted_at) throw errors.conflict("Restore this file from the trash before editing it.");

  const { data, error } = await supabase.from("files").update(update).eq("id", id).eq("owner_id", user.id).select("*").single();
  if (error) {
    if (error.code === "23503") throw errors.badRequest("That folder doesn't exist.");
    throw error;
  }
  // Names are part of the search index; refresh the file-level record when it changes.
  if (update.display_name) {
    await adminOrThrow().from("memory_records").update({ title: update.display_name as string }).eq("file_id", id).eq("owner_id", user.id).in("kind", ["file", "chunk"]);
  }
  return { file: data };
});

const delQuery = z.object({ permanent: z.enum(["0", "1"]).default("0") });

export const DELETE = route<undefined, z.infer<typeof delQuery>, P>({ query: delQuery }, async ({ query, supabase, user, params }) => {
  const { id } = idParams.parse(params);
  const file = await ownFile(supabase, user.id, id);
  if (query.permanent === "1") {
    if (!file.deleted_at) throw errors.conflict("Move the file to the trash first.");
    await purgeFiles(adminOrThrow(), user.id, [id]);
    await audit(user.id, "file.deleted_permanently", { type: "file", id });
    return { ok: true, permanent: true };
  }
  const { error } = await supabase.from("files").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("owner_id", user.id);
  if (error) throw error;
  // Live shares stop working immediately (has_file_share checks deleted_at); revoke them for clarity.
  await adminOrThrow().from("sharing_permissions").update({ status: "revoked", revoked_at: new Date().toISOString() }).eq("file_id", id).in("status", ["pending", "accepted"]);
  await audit(user.id, "file.trashed", { type: "file", id });
  return { ok: true };
});
