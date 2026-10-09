import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toPgVector } from "@/lib/ai/embeddings";
import type { SearchHit } from "./types";

export interface SearchFilters {
  terms?: string[];
  embedding?: number[] | null;
  kinds?: string[] | null;
  sourceIds?: string[] | null;
  preferSources?: string[] | null;
  categories?: string[] | null;
  mimeTypes?: string[] | null;
  sender?: string | null;
  from?: string | null;
  to?: string | null;
  collectionId?: string | null;
  fileIds?: string[] | null;
  conversationId?: string | null;
  recencyBoost?: boolean;
  limit?: number;
}

/**
 * Hybrid search over the signed-in user's memory.
 * `supabase` MUST be the user-scoped client: the database function is SECURITY INVOKER, so row
 * level security (and an explicit auth.uid() check) decides what can be returned. There is
 * deliberately no way to pass a user id.
 */
export async function searchMemory(supabase: SupabaseClient, f: SearchFilters): Promise<SearchHit[]> {
  const { data, error } = await supabase.rpc("search_memory", {
    p_terms: f.terms?.length ? f.terms : null,
    p_embedding: f.embedding ? toPgVector(f.embedding) : null,
    p_kinds: f.kinds ?? null,
    p_source_ids: f.sourceIds ?? null,
    p_prefer_sources: f.preferSources ?? null,
    p_file_categories: f.categories ?? null,
    p_mime_types: f.mimeTypes ?? null,
    p_sender: f.sender ?? null,
    p_from: f.from ?? null,
    p_to: f.to ?? null,
    p_collection_id: f.collectionId ?? null,
    p_file_ids: f.fileIds ?? null,
    p_conversation_id: f.conversationId ?? null,
    p_recency_boost: f.recencyBoost ?? true,
    p_limit: f.limit ?? 40,
  });
  if (error) throw new Error(`Search failed (${error.message}).`);
  return (data ?? []) as SearchHit[];
}
