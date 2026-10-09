import { z } from "zod";
import { errors, route } from "@/lib/api";
import { purgeFiles } from "@/lib/processing/pipeline";
import { adminOrThrow, audit } from "@/lib/server/context";
import { cleanTags } from "@/lib/server/files";

const body = z.object({
  ids: z.array(z.uuid()).min(1).max(200),
  action: z.enum(["trash", "restore", "star", "unstar", "move", "add_tags", "purge"]),
  folderId: z.uuid().nullable().optional(),
  tags: z.array(z.string().max(60)).max(20).optional(),
});

export const POST = route({ body, rateLimit: { name: "file-bulk", max: 60, windowSeconds: 600 } }, async ({ body, supabase, user }) => {
  const ids = [...new Set(body.ids)];
  const { data: owned, error } = await supabase.from("files").select("id,deleted_at,tags").eq("owner_id", user.id).eq("purpose", "memory").in("id", ids);
  if (error) throw error;
  const rows = (owned ?? []) as { id: string; deleted_at: string | null; tags: string[] }[];
  if (rows.length === 0) throw errors.notFound();
  const ownedIds = rows.map((r) => r.id);

  switch (body.action) {
    case "trash": {
      const { error: e } = await supabase.from("files").update({ deleted_at: new Date().toISOString() }).eq("owner_id", user.id).in("id", ownedIds);
      if (e) throw e;
      await adminOrThrow().from("sharing_permissions").update({ status: "revoked", revoked_at: new Date().toISOString() }).in("file_id", ownedIds).in("status", ["pending", "accepted"]);
      break;
    }
    case "restore": {
      const { error: e } = await supabase.from("files").update({ deleted_at: null }).eq("owner_id", user.id).in("id", ownedIds);
      if (e) throw e;
      break;
    }
    case "star":
    case "unstar": {
      const { error: e } = await supabase.from("files").update({ starred: body.action === "star" }).eq("owner_id", user.id).in("id", ownedIds);
      if (e) throw e;
      break;
    }
    case "move": {
      if (body.folderId === undefined) throw errors.badRequest("Choose a destination folder.");
      const { error: e } = await supabase.from("files").update({ folder_id: body.folderId }).eq("owner_id", user.id).in("id", ownedIds);
      if (e) throw e;
      break;
    }
    case "add_tags": {
      const add = cleanTags(body.tags ?? []);
      if (add.length === 0) throw errors.badRequest("Enter at least one tag.");
      for (const r of rows) {
        const { error: e } = await supabase.from("files").update({ tags: cleanTags([...r.tags, ...add]) }).eq("id", r.id).eq("owner_id", user.id);
        if (e) throw e;
      }
      break;
    }
    case "purge": {
      const trashed = rows.filter((r) => r.deleted_at).map((r) => r.id);
      if (trashed.length === 0) throw errors.conflict("Only files in the trash can be deleted permanently.");
      const n = await purgeFiles(adminOrThrow(), user.id, trashed);
      await audit(user.id, "file.deleted_permanently", { type: "file" }, { count: n });
      return { ok: true, affected: n };
    }
  }
  return { ok: true, affected: ownedIds.length };
});
