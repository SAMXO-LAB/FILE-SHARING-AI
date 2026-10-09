import { z } from "zod";
import { errors, route } from "@/lib/api";
import { adminOrThrow, audit } from "@/lib/server/context";
import { ownFile } from "@/lib/server/files";

const query = z.object({ direction: z.enum(["sent", "received"]).default("received"), fileId: z.uuid().optional() });

/**
 * Shares involving the caller. Display details (file name, other party's username) are added by the
 * server only for rows the caller is a party to; nothing else about the other account is disclosed.
 */
export const GET = route({ query }, async ({ supabase, user, query }) => {
  let sel = supabase
    .from("sharing_permissions").select("id,owner_id,recipient_id,file_id,status,can_download,note,expires_at,accepted_at,revoked_at,created_at")
    .order("created_at", { ascending: false }).limit(200);
  sel = query.direction === "sent" ? sel.eq("owner_id", user.id) : sel.eq("recipient_id", user.id);
  if (query.fileId) sel = sel.eq("file_id", query.fileId);
  const { data, error } = await sel;
  if (error) throw error;
  const rows = data ?? [];
  const admin = adminOrThrow();
  const fileIds = [...new Set(rows.map((r) => r.file_id as string))];
  const userIds = [...new Set(rows.map((r) => (query.direction === "sent" ? r.recipient_id : r.owner_id) as string))];
  const [{ data: files }, { data: profiles }] = await Promise.all([
    fileIds.length ? admin.from("files").select("id,display_name,category,mime_type,size_bytes,deleted_at").in("id", fileIds) : { data: [] },
    userIds.length ? admin.from("profiles").select("id,username,display_name").in("id", userIds) : { data: [] },
  ]);
  const F = new Map((files ?? []).map((f) => [f.id as string, f]));
  const U = new Map((profiles ?? []).map((p) => [p.id as string, p]));
  const now = Date.now();
  return {
    shares: rows.map((r) => {
      const f = F.get(r.file_id as string);
      const other = U.get((query.direction === "sent" ? r.recipient_id : r.owner_id) as string);
      const expired = Boolean(r.expires_at && new Date(r.expires_at as string).getTime() <= now);
      return {
        id: r.id, status: expired && ["pending", "accepted"].includes(r.status as string) ? "expired" : r.status,
        canDownload: r.can_download, note: r.note, expiresAt: r.expires_at, createdAt: r.created_at, acceptedAt: r.accepted_at,
        file: f ? { id: f.id, name: f.display_name, category: f.category, mime: f.mime_type, size: f.size_bytes, trashed: Boolean(f.deleted_at) } : null,
        otherParty: other ? { username: other.username, displayName: other.display_name } : null,
      };
    }),
  };
});

const body = z.object({
  fileId: z.uuid(),
  username: z.string().trim().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  canDownload: z.boolean().default(true),
  expiresInDays: z.number().int().min(1).max(90).default(7),
  note: z.string().trim().max(500).optional(),
});

export const POST = route({ body, rateLimit: { name: "share-create", max: 30, windowSeconds: 3600 } }, async ({ body, supabase, user }) => {
  const file = await ownFile(supabase, user.id, body.fileId);
  if (file.deleted_at) throw errors.conflict("Restore this file before sharing it.");
  if (file.status === "uploading") throw errors.conflict("Wait for the upload to finish before sharing.");
  const admin = adminOrThrow();
  const { data: recipient } = await admin.from("profiles").select("id,username").ilike("username", body.username.replace(/[\\%_]/g, (m) => `\\${m}`)).maybeSingle();
  if (!recipient) throw errors.notFound("No account has that username.");
  if (recipient.id === user.id) throw errors.badRequest("You can't share a file with yourself.");

  const expiresAt = new Date(Date.now() + body.expiresInDays * 86400_000).toISOString();
  const { data, error } = await admin
    .from("sharing_permissions")
    .insert({ owner_id: user.id, file_id: file.id, recipient_id: recipient.id, can_download: body.canDownload, expires_at: expiresAt, note: body.note || null })
    .select("id,status,expires_at").single();
  if (error) {
    if (error.code === "23505") throw errors.conflict("This file is already shared with that person.");
    throw error;
  }
  await audit(user.id, "share.created", { type: "file", id: file.id }, { recipient: recipient.id, canDownload: body.canDownload, expiresAt });
  return { share: data };
});
