import { z } from "zod";
import { route } from "@/lib/api";
import { escapeLike } from "@/lib/server/files";

const query = z.object({
  view: z.enum(["all", "starred", "trash", "recent"]).default("all"),
  category: z.string().max(100).optional(), // comma-separated categories
  q: z.string().max(200).optional(),
  folder: z.union([z.uuid(), z.literal("root"), z.literal("any")]).default("any"),
  tag: z.string().max(40).optional(),
  source: z.string().max(40).optional(),
  status: z.string().max(40).optional(),
  sort: z.enum(["date", "name", "size", "type"]).default("date"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  limit: z.coerce.number().int().min(1).max(200).default(60),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});

const CATEGORIES = new Set(["document", "image", "audio", "video", "archive", "code", "data", "other"]);

export const GET = route({ query }, async ({ supabase, user, query: q }) => {
  let sel = supabase.from("files").select("*", { count: "exact" }).eq("owner_id", user.id).eq("purpose", "memory");
  sel = q.view === "trash" ? sel.not("deleted_at", "is", null) : sel.is("deleted_at", null);
  if (q.view === "starred") sel = sel.eq("starred", true);
  if (q.category) {
    const cats = q.category.split(",").filter((c) => CATEGORIES.has(c));
    if (cats.length) sel = sel.in("category", cats);
  }
  if (q.q?.trim()) sel = sel.ilike("display_name", `%${escapeLike(q.q.trim())}%`);
  if (q.folder === "root") sel = sel.is("folder_id", null);
  else if (q.folder !== "any") sel = sel.eq("folder_id", q.folder);
  if (q.tag) sel = sel.contains("tags", [q.tag.toLowerCase()]);
  if (q.source) sel = sel.eq("source_id", q.source);
  if (q.status) sel = sel.in("status", q.status.split(","));

  const column = { date: q.view === "trash" ? "deleted_at" : "created_at", name: "display_name", size: "size_bytes", type: "category" }[q.sort];
  const sorted = q.view === "recent" ? sel.order("created_at", { ascending: false }) : sel.order(column, { ascending: q.dir === "asc" });
  const { data, error, count } = await sorted.order("id").range(q.offset, q.offset + q.limit - 1);
  if (error) throw error;
  return { files: data ?? [], total: count ?? 0, offset: q.offset, limit: q.limit };
});
