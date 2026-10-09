import { z } from "zod";
import { route } from "@/lib/api";

const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(40), offset: z.coerce.number().int().min(0).default(0) });

export const GET = route({ query }, async ({ supabase, user, query }) => {
  const { data, error } = await supabase
    .from("ai_conversations").select("id,title,created_at,updated_at").eq("owner_id", user.id)
    .order("updated_at", { ascending: false }).range(query.offset, query.offset + query.limit - 1);
  if (error) throw error;
  return { conversations: data ?? [] };
});

/** Clears all Ask AI chat history. */
export const DELETE = route({ rateLimit: { name: "chat-clear", max: 10, windowSeconds: 600 } }, async ({ supabase, user }) => {
  const { error } = await supabase.from("ai_conversations").delete().eq("owner_id", user.id);
  if (error) throw error;
  return { ok: true };
});
