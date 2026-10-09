import { z } from "zod";
import { errors, route } from "@/lib/api";

export const GET = route({}, async ({ supabase, user }) => {
  const [{ data: folders, error }, { data: counts }] = await Promise.all([
    supabase.from("folders").select("id,parent_id,name,created_at").eq("owner_id", user.id).order("name"),
    supabase.from("files").select("folder_id").eq("owner_id", user.id).eq("purpose", "memory").is("deleted_at", null).not("folder_id", "is", null).limit(20000),
  ]);
  if (error) throw error;
  const n = new Map<string, number>();
  for (const r of counts ?? []) n.set(r.folder_id as string, (n.get(r.folder_id as string) ?? 0) + 1);
  return { folders: (folders ?? []).map((f) => ({ ...f, fileCount: n.get(f.id) ?? 0 })) };
});

const body = z.object({ name: z.string().trim().min(1).max(120).regex(/^[^/\\]+$/, "Names can't contain / or \\"), parentId: z.uuid().nullable().optional() });

export const POST = route({ body, rateLimit: { name: "folder-create", max: 120, windowSeconds: 600 } }, async ({ body, supabase, user }) => {
  const { data, error } = await supabase
    .from("folders").insert({ owner_id: user.id, name: body.name, parent_id: body.parentId ?? null }).select("*").single();
  if (error) {
    if (error.code === "23505") throw errors.conflict("A folder with that name already exists here.");
    if (error.code === "23503") throw errors.badRequest("The parent folder doesn't exist.");
    throw error;
  }
  return { folder: data };
});
