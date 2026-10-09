import { z } from "zod";
import { errors, must, route } from "@/lib/api";
import { idParams } from "@/lib/validation";

const patch = z
  .object({ name: z.string().trim().min(1).max(120).regex(/^[^/\\]+$/, "Names can't contain / or \\"), parentId: z.uuid().nullable() })
  .partial()
  .strict();

export const PATCH = route<z.infer<typeof patch>, undefined, { id: string }>({ body: patch }, async ({ body, supabase, user, params }) => {
  const { id } = idParams.parse(params);
  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.parentId !== undefined) {
    if (body.parentId === id) throw errors.badRequest("A folder can't be moved into itself.");
    if (body.parentId) {
      // Refuse cycles: walk up from the new parent; we must not meet this folder.
      const { data: all } = await supabase.from("folders").select("id,parent_id").eq("owner_id", user.id).limit(5000);
      const parent = new Map((all ?? []).map((f) => [f.id as string, f.parent_id as string | null]));
      for (let cur: string | null | undefined = body.parentId, hops = 0; cur; cur = parent.get(cur), hops++) {
        if (cur === id) throw errors.badRequest("A folder can't be moved into one of its own subfolders.");
        if (hops > 100) break;
      }
    }
    update.parent_id = body.parentId;
  }
  if (Object.keys(update).length === 0) throw errors.badRequest("Nothing to update.");
  const { data, error } = await supabase.from("folders").update(update).eq("id", id).eq("owner_id", user.id).select("*").maybeSingle();
  if (error) {
    if (error.code === "23505") throw errors.conflict("A folder with that name already exists here.");
    if (error.code === "23503") throw errors.badRequest("The destination folder doesn't exist.");
    throw error;
  }
  return { folder: must(data) };
});

/** Deleting a folder removes the folder and its subfolders only. Files inside return to "All files". */
export const DELETE = route<undefined, undefined, { id: string }>({}, async ({ supabase, user, params }) => {
  const { id } = idParams.parse(params);
  const { error } = await supabase.from("folders").delete().eq("id", id).eq("owner_id", user.id);
  if (error) throw error;
  return { ok: true };
});
