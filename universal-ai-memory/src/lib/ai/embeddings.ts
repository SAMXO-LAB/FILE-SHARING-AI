import "server-only";
import { embeddingConfig } from "@/lib/env";
import { AiNotConfiguredError, AiProviderError } from "./provider";

export const EMBEDDING_DIMENSIONS = 1536;

export function embeddingsAvailable(): boolean {
  return embeddingConfig() !== null;
}
export function embeddingLocality(): "cloud" | "local" | null {
  return embeddingConfig()?.locality ?? null;
}
export function embeddingModelName(): string | null {
  return embeddingConfig()?.model ?? null;
}

/** pgvector text literal. */
export function toPgVector(v: number[]): string {
  return `[${v.join(",")}]`;
}

/**
 * Embeds texts through an OpenAI-compatible /embeddings endpoint, in batches.
 * Fails loudly if the model's dimension does not match the database column.
 */
export async function embedTexts(texts: string[], signal?: AbortSignal): Promise<number[][]> {
  const cfg = embeddingConfig();
  if (!cfg) throw new AiNotConfiguredError("No embedding model is configured on this server.");
  const out: number[][] = [];
  const BATCH = 64;
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH).map((t) => t.slice(0, 8000) || " ");
    // OpenAI's text-embedding-3-* and Google's gemini-embedding-* can return a shortened vector that fits
    // the column. Other models must already produce the right size.
    const shorten = cfg.model.startsWith("text-embedding-3") || cfg.model.startsWith("gemini-embedding");
    const call = (withDims: boolean) => {
      const timeout = AbortSignal.timeout(60_000);
      return fetch(`${cfg.baseUrl}/embeddings`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) },
        body: JSON.stringify({ model: cfg.model, input: batch, ...(withDims ? { dimensions: cfg.dimensions } : {}) }),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      }).catch((e: Error) => {
        throw new AiProviderError(`Could not reach the embedding provider (${e.message}).`);
      });
    };
    let res = await call(shorten);
    if (!res.ok && res.status === 400 && shorten && !cfg.model.startsWith("text-embedding-3")) res = await call(false);
    if (!res.ok) {
      throw new AiProviderError(
        `The embedding provider returned ${res.status}.${res.status === 401 || res.status === 403 ? " Check EMBEDDING_API_KEY / AI_API_KEY." : res.status === 429 ? " The provider is rate limiting requests." : ""}`,
        res.status,
      );
    }
    const data = (await res.json()) as { data?: { embedding: number[]; index: number }[] };
    const rows = [...(data.data ?? [])].sort((a, b) => a.index - b.index);
    if (rows.length !== batch.length) throw new AiProviderError("The embedding provider returned an unexpected number of vectors.");
    for (const r of rows) {
      if (r.embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new AiProviderError(
          `Embedding model "${cfg.model}" returned ${r.embedding.length} dimensions but the database expects ${EMBEDDING_DIMENSIONS}. ` +
            `Use a ${EMBEDDING_DIMENSIONS}-dimension model (e.g. text-embedding-3-small) or change the vector column.`,
        );
      }
      out.push(r.embedding);
    }
  }
  return out;
}
