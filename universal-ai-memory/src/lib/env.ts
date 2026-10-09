/**
 * Environment access. Nothing here throws at import time: optional integrations must
 * never crash the app. Each feature asks `*Configured()` and renders a setup state.
 *
 * SECURITY: only NEXT_PUBLIC_* values are safe for browser code. Everything else must be
 * read on the server only (this module is imported by server code; the secret getters
 * refuse to run in a browser).
 */

function server(name: string): string | undefined {
  if (typeof window !== "undefined") {
    throw new Error(`Server-only environment variable ${name} was requested in the browser`);
  }
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

function int(name: string, fallback: number): number {
  const v = server(name);
  const n = v ? Number.parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// -- Public (safe for the browser) -------------------------------------------------------
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || undefined,
  supabaseKey:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    undefined,
  appUrl: process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000",
};

export function supabaseConfigured(): boolean {
  return Boolean(publicEnv.supabaseUrl && publicEnv.supabaseKey);
}

// -- Server ------------------------------------------------------------------------------
export function supabaseSecretKey(): string | undefined {
  return server("SUPABASE_SECRET_KEY") ?? server("SUPABASE_SERVICE_ROLE_KEY");
}
export function adminConfigured(): boolean {
  return supabaseConfigured() && Boolean(supabaseSecretKey());
}

export type AiProviderKind = "openai" | "openai-compatible" | "anthropic";

export interface AiConfig {
  provider: AiProviderKind;
  apiKey?: string;
  baseUrl: string;
  chatModel: string;
  /** "local" when the endpoint is self-hosted (e.g. Ollama): enables the "local" privacy mode. */
  locality: "cloud" | "local";
}

export function aiConfig(): AiConfig | null {
  const provider = (server("AI_PROVIDER") ?? "") as AiProviderKind | "";
  if (!provider) return null;
  if (!["openai", "openai-compatible", "anthropic"].includes(provider)) return null;
  const apiKey = server("AI_API_KEY");
  const locality = server("AI_PROVIDER_LOCALITY") === "local" ? "local" : "cloud";
  const baseUrl =
    server("AI_BASE_URL") ??
    (provider === "anthropic" ? "https://api.anthropic.com" : "https://api.openai.com/v1");
  const chatModel = server("AI_MODEL");
  if (!chatModel) return null;
  // Local endpoints often need no key; hosted ones always do.
  if (!apiKey && locality !== "local") return null;
  return { provider: provider as AiProviderKind, apiKey, baseUrl: baseUrl.replace(/\/+$/, ""), chatModel, locality };
}

export interface EmbeddingConfig {
  apiKey?: string;
  baseUrl: string;
  model: string;
  /** Must match the vector(1536) column. */
  dimensions: number;
  locality: "cloud" | "local";
}

export function embeddingConfig(): EmbeddingConfig | null {
  const model = server("EMBEDDING_MODEL");
  if (!model) return null;
  const locality =
    (server("EMBEDDING_PROVIDER_LOCALITY") ?? server("AI_PROVIDER_LOCALITY")) === "local" ? "local" : "cloud";
  const apiKey = server("EMBEDDING_API_KEY") ?? server("AI_API_KEY");
  const baseUrl = server("EMBEDDING_BASE_URL") ?? server("AI_BASE_URL") ?? "https://api.openai.com/v1";
  if (!apiKey && locality !== "local") return null;
  return { apiKey, baseUrl: baseUrl.replace(/\/+$/, ""), model, dimensions: 1536, locality };
}

export interface TranscriptionConfig {
  apiKey?: string;
  baseUrl: string;
  model: string;
  locality: "cloud" | "local";
}

export function transcriptionConfig(): TranscriptionConfig | null {
  const model = server("TRANSCRIPTION_MODEL");
  if (!model) return null;
  const apiKey = server("TRANSCRIPTION_API_KEY") ?? server("AI_API_KEY");
  const locality = server("AI_PROVIDER_LOCALITY") === "local" ? "local" : "cloud";
  if (!apiKey && locality !== "local") return null;
  return {
    apiKey,
    baseUrl: (server("TRANSCRIPTION_BASE_URL") ?? server("AI_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/+$/, ""),
    model,
    locality,
  };
}

/** Image OCR via a vision-capable chat model (same provider as chat). Opt-in. */
export function ocrEnabled(): boolean {
  return server("OCR_WITH_VISION_MODEL") === "true" && aiConfig() !== null;
}

export function telegramConfig(): { botToken: string; botUsername?: string; webhookSecret: string } | null {
  const botToken = server("TELEGRAM_BOT_TOKEN");
  const webhookSecret = server("TELEGRAM_WEBHOOK_SECRET");
  if (!botToken || !webhookSecret) return null;
  return { botToken, botUsername: server("TELEGRAM_BOT_USERNAME")?.replace(/^@/, ""), webhookSecret };
}

export const limits = {
  /** Largest file the server will accept regardless of per-user settings. */
  get maxUploadBytes() { return int("MAX_UPLOAD_BYTES", 2 * 1024 * 1024 * 1024); },
  /** Largest file the pipeline will download to extract text from. Bigger files are indexed by metadata. */
  get maxExtractBytes() { return int("MAX_EXTRACT_BYTES", 50 * 1024 * 1024); },
  /** Largest chat export (txt/json/zip) the importer will load into memory. */
  get maxImportBytes() { return int("MAX_IMPORT_BYTES", 200 * 1024 * 1024); },
  get maxExtractedChars() { return int("MAX_EXTRACTED_CHARS", 2_000_000); },
  get defaultQuotaBytes() { return int("DEFAULT_QUOTA_BYTES", 5 * 1024 * 1024 * 1024); },
  get signedUrlSeconds() { return int("SIGNED_URL_SECONDS", 60); },
};

export function cronSecret(): string | undefined {
  return server("CRON_SECRET");
}

export function clamavConfigured(): { host: string; port: number } | null {
  const host = server("CLAMAV_HOST");
  if (!host) return null;
  return { host, port: int("CLAMAV_PORT", 3310) };
}

/** What the UI may show about server configuration: booleans only, never values. */
export function capabilities() {
  const ai = aiConfig();
  const emb = embeddingConfig();
  return {
    supabase: supabaseConfigured(),
    admin: adminConfigured(),
    ai: Boolean(ai),
    aiLocality: ai?.locality ?? null,
    embeddings: Boolean(emb),
    embeddingsLocality: emb?.locality ?? null,
    transcription: Boolean(transcriptionConfig()),
    ocr: ocrEnabled(),
    telegram: Boolean(telegramConfig()),
    telegramBotUsername: telegramConfig()?.botUsername ?? null,
    malwareScan: Boolean(clamavConfigured()),
    cron: Boolean(cronSecret()),
  };
}
export type Capabilities = ReturnType<typeof capabilities>;
