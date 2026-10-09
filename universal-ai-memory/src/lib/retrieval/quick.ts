import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { embedTexts } from "@/lib/ai/embeddings";
import type { Policy } from "@/lib/ai/policy";
import { buildCards, groupSections } from "./cards";
import { interpretHeuristic, type Interpretation } from "./interpret";
import { searchMemory, type SearchFilters } from "./search";
import type { ContentCard } from "./types";
import type { UserFilters } from "./answer";

export interface QuickSearchResult {
  cards: ContentCard[];
  sections: ReturnType<typeof groupSections>;
  chips: Interpretation["chips"];
  semantic: boolean;
  limitations: string[];
  browse: boolean;
}

/**
 * Search without writing an answer: same hybrid retrieval and permission checks as Ask AI, but no
 * language model is involved, so it works in every privacy mode. An empty query browses recent items.
 */
export async function quickSearch(
  supabase: SupabaseClient,
  input: { q: string; policy: Policy; filters?: UserFilters; tzOffsetMinutes?: number; limit?: number },
): Promise<QuickSearchResult> {
  const limitations: string[] = [];
  const q = input.q.trim();
  const interp = q ? interpretHeuristic(q, { tzOffsetMinutes: input.tzOffsetMinutes }) : null;
  const dropped = new Set(input.filters?.dropped ?? []);
  const f = input.filters ?? {};

  const terms = interp?.terms ?? [];
  const sender = interp && !dropped.has("sender") ? interp.sender : null;
  const range = interp && !dropped.has("date") ? interp.dateRange : null;
  const mimeTypes = interp && !dropped.has("type") ? interp.mimeTypes : null;
  const categories = f.categories?.length ? f.categories : interp && !dropped.has("type") ? interp.fileCategories : null;
  const sources = f.sourceIds?.length ? f.sourceIds : interp && !dropped.has("source") ? interp.sources : null;

  const base: SearchFilters = {
    terms, kinds: null, sourceIds: sources, categories, mimeTypes,
    from: f.from ?? range?.from ?? null, to: f.to ?? range?.to ?? null, collectionId: f.collectionId ?? null,
    recencyBoost: input.policy.recencyBoost, limit: 60,
  };

  let semantic = false;
  if (input.policy.embed && terms.length > 0) {
    try {
      const [vec] = await embedTexts([q]);
      base.embedding = vec;
      semantic = true;
    } catch {
      limitations.push("Semantic search is unavailable right now; showing keyword matches.");
    }
  }
  const hits = await searchMemory(supabase, { ...base, sender });
  const browse = terms.length === 0 && !sender && !range && !mimeTypes && !categories && !sources;
  const cards = await buildCards(supabase, hits, terms, { maxCards: input.limit ?? 24, senderMatched: sender ? true : undefined });
  if (!input.policy.embed && terms.length > 0) {
    limitations.push("Semantic (meaning-based) search is off for your privacy mode, so only keyword and metadata matching is used.");
  }
  return { cards, sections: groupSections(cards), chips: interp?.chips ?? [], semantic, limitations, browse };
}
