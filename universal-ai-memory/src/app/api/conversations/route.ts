import { z } from "zod";
import { route } from "@/lib/api";
import { escapeLike } from "@/lib/server/files";

const query = z.object({
  q: z.string().max(200).optional(),
  source: z.enum(["whatsapp", "telegram"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
  offset: z.coerce.number().int().min(0).default(0),
});

export const GET = route({ query }, async ({ supabase, user, query }) => {
  let sel = supabase
    .from("conversations")
    .select("id,title,source_id,message_count,participants,first_message_at,last_message_at,created_at", { count: "exact" })
    .eq("owner_id", user.id);
  if (query.source) sel = sel.eq("source_id", query.source);
  if (query.q?.trim()) sel = sel.ilike("title", `%${escapeLike(query.q.trim())}%`);
  const { data, error, count } = await sel.order("last_message_at", { ascending: false, nullsFirst: false }).range(query.offset, query.offset + query.limit - 1);
  if (error) throw error;
  return { conversations: data ?? [], total: count ?? 0 };
});
