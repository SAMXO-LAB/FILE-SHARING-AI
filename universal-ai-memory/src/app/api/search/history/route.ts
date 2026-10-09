import { z } from "zod";
import { route } from "@/lib/api";

export const GET = route({}, async ({ supabase, user }) => {
  const { data, error } = await supabase.from("search_history").select("id,query,result_count,created_at").eq("owner_id", user.id).order("created_at", { ascending: false }).limit(60);
  if (error) throw error;
  const seen = new Set<string>();
  const items = (data ?? []).filter((r) => {
    const k = String(r.query).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 20);
  return { history: items };
});

const query = z.object({ id: z.uuid().optional() });

export const DELETE = route({ query }, async ({ supabase, user, query }) => {
  let del = supabase.from("search_history").delete().eq("owner_id", user.id);
  if (query.id) del = del.eq("id", query.id);
  const { error } = await del;
  if (error) throw error;
  return { ok: true };
});
