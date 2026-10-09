import { z } from "zod";
import { route } from "@/lib/api";
import { loadPolicy } from "@/lib/ai/policy";
import { quickSearch } from "@/lib/retrieval/quick";
import { filtersSchema } from "@/lib/validation";

export const maxDuration = 30;

const body = z.object({
  q: z.string().max(1000).default(""),
  filters: filtersSchema.optional(),
  tzOffsetMinutes: z.number().int().min(-840).max(840).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  record: z.boolean().optional(),
});

export const POST = route({ body, rateLimit: { name: "search", max: 240, windowSeconds: 600 } }, async ({ body, supabase, user }) => {
  const policy = await loadPolicy(supabase, user.id);
  const result = await quickSearch(supabase, { q: body.q, policy, filters: body.filters, tzOffsetMinutes: body.tzOffsetMinutes, limit: body.limit });
  if (body.record && body.q.trim() && policy.saveHistory) {
    await supabase.from("search_history").insert({ owner_id: user.id, query: body.q.trim().slice(0, 2000), filters: body.filters ?? {}, result_count: result.cards.length });
  }
  return result;
});
