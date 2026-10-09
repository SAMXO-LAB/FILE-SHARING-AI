import "server-only";
import { z, type ZodType } from "zod";
import { aiConfig, aiConfigs, type AiConfig } from "@/lib/env";

/**
 * Provider-independent chat interface. Supports OpenAI, any OpenAI-compatible endpoint
 * (OpenRouter, Groq, Ollama, vLLM, LM Studio, ...) and Anthropic, selected by environment.
 * API keys never leave the server.
 */

export class AiNotConfiguredError extends Error {
  constructor(message = "No AI provider is configured on this server.") {
    super(message);
  }
}
export class AiProviderError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  /** Optional images (data URLs) for vision-capable models. */
  images?: string[];
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  signal?: AbortSignal;
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(90_000);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  }).catch((e: Error) => {
    throw new AiProviderError(`Could not reach the AI provider (${e.name === "TimeoutError" ? "timed out" : e.message}).`);
  });
  if (!res.ok) {
    let detail = "";
    try {
      const j = (await res.json()) as { error?: { message?: string } | string };
      detail = typeof j.error === "string" ? j.error : (j.error?.message ?? "");
    } catch {
      /* ignore */
    }
    const hint = res.status === 401 || res.status === 403 ? " Check AI_API_KEY." : res.status === 429 ? " The provider is rate limiting requests." : "";
    throw new AiProviderError(`The AI provider returned ${res.status}.${hint}${detail ? ` ${detail.slice(0, 200)}` : ""}`, res.status);
  }
  return res.json() as Promise<unknown>;
}

function openAiMessages(messages: ChatMessage[]) {
  return messages.map((m) =>
    m.images?.length
      ? {
          role: m.role,
          content: [
            { type: "text", text: m.content },
            ...m.images.map((url) => ({ type: "image_url", image_url: { url } })),
          ],
        }
      : { role: m.role, content: m.content },
  );
}

async function chatOpenAi(cfg: AiConfig, messages: ChatMessage[], o: ChatOptions): Promise<string> {
  const headers: Record<string, string> = cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {};
  const body = { model: cfg.chatModel, messages: openAiMessages(messages), temperature: o.temperature ?? 0.2, max_tokens: o.maxTokens ?? 1500 };
  let data: { choices?: { message?: { content?: string } }[] };
  try {
    data = (await postJson(`${cfg.baseUrl}/chat/completions`, headers, { ...body, ...(o.json ? { response_format: { type: "json_object" } } : {}) }, o.signal)) as typeof data;
  } catch (e) {
    // Some OpenAI-compatible providers reject JSON mode. The prompts already ask for JSON and the
    // output is parsed tolerantly, so retry once without it.
    if (!(o.json && e instanceof AiProviderError && (e.status === 400 || e.status === 422))) throw e;
    const json = [...messages];
    json.unshift({ role: "system", content: "Respond with a single JSON object and nothing else." });
    data = (await postJson(`${cfg.baseUrl}/chat/completions`, headers, { ...body, messages: openAiMessages(json) }, o.signal)) as typeof data;
  }
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new AiProviderError("The AI provider returned an empty response.");
  return text;
}

async function chatAnthropic(cfg: AiConfig, messages: ChatMessage[], o: ChatOptions): Promise<string> {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const rest = messages.filter((m) => m.role !== "system").map((m) => ({
    role: m.role,
    content: m.images?.length
      ? [
          ...m.images.map((url) => {
            const mt = /^data:([^;]+);base64,(.*)$/s.exec(url);
            return { type: "image", source: { type: "base64", media_type: mt?.[1] ?? "image/png", data: mt?.[2] ?? "" } };
          }),
          { type: "text", text: m.content },
        ]
      : m.content,
  }));
  const data = (await postJson(
    `${cfg.baseUrl}/v1/messages`,
    { "x-api-key": cfg.apiKey ?? "", "anthropic-version": "2023-06-01" },
    {
      model: cfg.chatModel,
      system: o.json ? `${system}\n\nRespond with a single JSON object and nothing else.` : system,
      messages: rest,
      temperature: o.temperature ?? 0.2,
      max_tokens: o.maxTokens ?? 1500,
    },
    o.signal,
  )) as { content?: { type: string; text?: string }[] };
  const text = data.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  if (!text) throw new AiProviderError("The AI provider returned an empty response.");
  return text;
}

export function aiLocality(): "cloud" | "local" | null {
  return aiConfig()?.locality ?? null;
}

/** Providers that recently failed are skipped for a while so requests don't wait on them (per server instance). */
const cooldown = new Map<string, number>();
const keyOf = (c: AiConfig) => `${c.baseUrl}|${c.chatModel}`;
function cooldownMs(e: AiProviderError): number {
  if (e.status === 429) return 60_000; // rate limited: try again in a minute
  if (e.status === 401 || e.status === 403 || e.status === 404) return 10 * 60_000; // bad key or retired model
  if (e.status === undefined || e.status >= 500) return 30_000; // outage / timeout
  return 0;
}
/** For tests. */
export function _resetProviderCooldowns() { cooldown.clear(); }

/**
 * Sends the conversation to the first working provider in the chain (see aiConfigs()). On a failure
 * (rate limit, outage, bad key, retired model, rejected request) the next provider is tried. If every
 * provider fails, the last error is thrown and callers fall back to showing matching passages.
 */
export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  const all = aiConfigs();
  if (all.length === 0) throw new AiNotConfiguredError();
  const now = Date.now();
  const ready = all.filter((c) => (cooldown.get(keyOf(c)) ?? 0) <= now);
  // If everything is cooling down, still try them all rather than failing without a request.
  const chain = ready.length ? ready : all;
  const failures: string[] = [];
  let last: unknown;
  for (const cfg of chain) {
    if (opts.signal?.aborted) throw opts.signal.reason ?? new Error("aborted");
    try {
      const text = cfg.provider === "anthropic" ? await chatAnthropic(cfg, messages, opts) : await chatOpenAi(cfg, messages, opts);
      cooldown.delete(keyOf(cfg));
      return text;
    } catch (e) {
      if (!(e instanceof AiProviderError)) throw e;
      last = e;
      const ms = cooldownMs(e);
      if (ms) cooldown.set(keyOf(cfg), Date.now() + ms);
      failures.push(`${cfg.name}: ${e.status ?? "network"}`);
      console.warn(`[ai] ${cfg.name} failed (${e.status ?? "network"}); ${chain.indexOf(cfg) < chain.length - 1 ? "trying the next provider" : "no providers left"}`);
    }
  }
  if (chain.length > 1 && last instanceof AiProviderError) {
    throw new AiProviderError(`All AI providers failed (${failures.join(", ")}). ${last.message}`, last.status);
  }
  throw last;
}

/** Extracts the first top-level JSON object from model output (models sometimes wrap it in prose/fences). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced ? fenced[1]! : text;
  const start = candidate.indexOf("{");
  if (start < 0) throw new Error("no JSON object found");
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return JSON.parse(candidate.slice(start, i + 1));
    }
  }
  throw new Error("unterminated JSON object");
}

/**
 * Structured output with validation. AI output is untrusted: it is parsed and validated against a
 * schema, and one repair attempt is made. Returns null if the model could not produce valid output,
 * so callers can fall back to deterministic behaviour.
 */
export async function chatJson<T>(messages: ChatMessage[], schema: ZodType<T>, opts: ChatOptions = {}): Promise<T | null> {
  const attempt = async (msgs: ChatMessage[]) => {
    const raw = await chat(msgs, { ...opts, json: true });
    const parsed = schema.safeParse(extractJson(raw));
    return parsed.success ? parsed.data : { error: z.prettifyError(parsed.error), raw };
  };
  try {
    const first = await attempt(messages);
    if (!("error" in (first as object))) return first as T;
    const err = first as unknown as { error: string; raw: string };
    const second = await attempt([
      ...messages,
      { role: "assistant", content: err.raw.slice(0, 4000) },
      { role: "user", content: `That did not match the required JSON format (${err.error.slice(0, 400)}). Reply with only the corrected JSON object.` },
    ]);
    return "error" in (second as object) ? null : (second as T);
  } catch (e) {
    if (e instanceof AiNotConfiguredError || e instanceof AiProviderError) throw e;
    return null;
  }
}
