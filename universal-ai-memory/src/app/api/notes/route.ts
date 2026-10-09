import { z } from "zod";
import { route } from "@/lib/api";
import { audit, indexNoteLater } from "@/lib/server/context";
import { escapeLike } from "@/lib/server/files";

const listQuery = z.object({
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
  offset: z.coerce.number().int().min(0).default(0),
});

export const GET = route({ query: listQuery }, async ({ supabase, user, query }) => {
  let sel = supabase.from("notes").select("id,title,origin,starred,created_at,updated_at,body", { count: "exact" }).eq("owner_id", user.id);
  if (query.q?.trim()) {
    const like = `%${escapeLike(query.q.trim()).replace(/[,()]/g, " ")}%`;
    sel = sel.or(`title.ilike.${like},body.ilike.${like}`);
  }
  const { data, error, count } = await sel.order("updated_at", { ascending: false }).range(query.offset, query.offset + query.limit - 1);
  if (error) throw error;
  // List view only needs a preview, not the whole body.
  return { notes: (data ?? []).map((n) => ({ ...n, preview: String(n.body).slice(0, 240), body: undefined })), total: count ?? 0 };
});

const noteBody = z.object({
  title: z.string().trim().max(200).default("Untitled note"),
  body: z.string().max(200_000).default(""),
  origin: z.enum(["user", "ai_answer"]).default("user"),
});

export const POST = route({ body: noteBody, rateLimit: { name: "note-save", max: 300, windowSeconds: 600 } }, async ({ body, supabase, user }) => {
  const { data, error } = await supabase
    .from("notes").insert({ owner_id: user.id, title: body.title || "Untitled note", body: body.body, origin: body.origin }).select("*").single();
  if (error) throw error;
  await audit(user.id, "note.created", { type: "note", id: data.id }, { origin: body.origin });
  indexNoteLater(data.id);
  return { note: data };
});
