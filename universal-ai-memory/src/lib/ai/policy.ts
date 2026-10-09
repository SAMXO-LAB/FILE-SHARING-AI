import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { embeddingLocality } from "./embeddings";
import { aiLocality } from "./provider";
import { mayExtractText, mayUseAi, type ProcessingMode } from "./privacy";
import type { Preferences } from "@/lib/types";
import { embeddingConfig, transcriptionConfig, ocrEnabled } from "@/lib/env";

/** What the pipeline/answer engine may do for ONE user, given their settings and the server config. */
export interface Policy {
  mode: ProcessingMode;
  extractText: boolean;
  /** Written answers, query understanding, summaries. */
  ai: boolean;
  enrich: boolean;
  embed: boolean;
  ocr: boolean;
  transcribe: boolean;
  recencyBoost: boolean;
  responseStyle: Preferences["response_style"];
  saveHistory: boolean;
}

export function policyFrom(prefs: Pick<Preferences, "processing_mode" | "semantic_indexing" | "auto_categorize" | "response_style" | "search_recency_boost" | "save_search_history">): Policy {
  const mode = prefs.processing_mode;
  const ai = mayUseAi(mode, aiLocality());
  const embed = prefs.semantic_indexing && embeddingConfig() !== null && mayUseAi(mode, embeddingLocality());
  const tr = transcriptionConfig();
  return {
    mode,
    extractText: mayExtractText(mode),
    ai,
    enrich: ai && prefs.auto_categorize,
    embed,
    ocr: ai && ocrEnabled(),
    transcribe: Boolean(tr) && mayUseAi(mode, tr?.locality ?? null),
    recencyBoost: prefs.search_recency_boost,
    responseStyle: prefs.response_style,
    saveHistory: prefs.save_search_history,
  };
}

export const DEFAULT_PREFS = {
  processing_mode: "extraction",
  semantic_indexing: true,
  auto_categorize: true,
  response_style: "balanced",
  search_recency_boost: true,
  save_search_history: true,
} as const;

export async function loadPolicy(client: SupabaseClient, userId: string): Promise<Policy> {
  const { data } = await client.from("user_preferences").select("*").eq("user_id", userId).maybeSingle();
  return policyFrom((data as Preferences | null) ?? DEFAULT_PREFS);
}
