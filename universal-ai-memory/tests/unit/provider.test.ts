import { afterEach, describe, expect, it, vi } from "vitest";
import { _resetProviderCooldowns, AiProviderError, chat, withAiDeadline } from "@/lib/ai/provider";
import { aiConfigs } from "@/lib/env";
import { embedTexts } from "@/lib/ai/embeddings";

const ENV = { AI_PROVIDER: "openai-compatible", AI_BASE_URL: "https://provider.test/v1", AI_API_KEY: "k", AI_MODEL: "free-model", EMBEDDING_MODEL: "gemini-embedding-001" };
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const bad = (status: number) => new Response(JSON.stringify({ error: { message: "unsupported" } }), { status, headers: { "content-type": "application/json" } });

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); _resetProviderCooldowns(); });

describe("OpenAI-compatible providers (e.g. free tiers)", () => {
  it("retries without JSON mode when the provider rejects it", async () => {
    for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
    const fetchMock = vi.fn().mockResolvedValueOnce(bad(400)).mockResolvedValueOnce(ok({ choices: [{ message: { content: "{\"answer\":\"hi\"}" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(chat([{ role: "user", content: "q" }], { json: true })).resolves.toBe("{\"answer\":\"hi\"}");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).response_format).toEqual({ type: "json_object" });
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body).response_format).toBeUndefined();
  });

  it("does not retry other errors", async () => {
    for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
    const fetchMock = vi.fn().mockResolvedValue(bad(401));
    vi.stubGlobal("fetch", fetchMock);
    await expect(chat([{ role: "user", content: "q" }], { json: true })).rejects.toThrow(/401/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks Gemini embeddings for 1536 dimensions to fit the database column", async () => {
    for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
    const fetchMock = vi.fn().mockResolvedValue(ok({ data: [{ index: 0, embedding: new Array(1536).fill(0.01) }] }));
    vi.stubGlobal("fetch", fetchMock);
    const [v] = await embedTexts(["hello"]);
    expect(v).toHaveLength(1536);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).dimensions).toBe(1536);
  });
});

describe("automatic fallback between providers", () => {
  const reply = (text: string) => ok({ choices: [{ message: { content: text } }] });
  const free = () => { vi.stubEnv("GEMINI_API_KEY", "g"); vi.stubEnv("GROQ_API_KEY", "q"); vi.stubEnv("OPENROUTER_API_KEY", "o"); };

  it("builds the chain from preset keys in the documented order", () => {
    free();
    expect(aiConfigs().map((c) => c.name)).toEqual(["Gemini", "Groq", "OpenRouter"]);
    vi.stubEnv("AI_FALLBACK_ORDER", "groq,openrouter,gemini");
    expect(aiConfigs().map((c) => c.name)).toEqual(["Groq", "OpenRouter", "Gemini"]);
  });

  it("puts AI_PROVIDER first and never adds cloud fallbacks behind a self-hosted provider", () => {
    free();
    vi.stubEnv("AI_PROVIDER", "openai-compatible"); vi.stubEnv("AI_BASE_URL", "http://localhost:11434/v1"); vi.stubEnv("AI_MODEL", "llama"); vi.stubEnv("AI_PROVIDER_LOCALITY", "local");
    expect(aiConfigs().map((c) => c.locality)).toEqual(["local"]);
    vi.stubEnv("AI_PROVIDER_LOCALITY", "cloud"); vi.stubEnv("AI_API_KEY", "k");
    expect(aiConfigs()).toHaveLength(4);
  });

  it("switches to the next provider when one is rate limited, then skips it while it cools down", async () => {
    free();
    const fetchMock = vi.fn(async (url: string) => (String(url).includes("googleapis") ? bad(429) : reply("from groq")));
    vi.stubGlobal("fetch", fetchMock);
    await expect(chat([{ role: "user", content: "q" }])).resolves.toBe("from groq");
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([expect.stringContaining("googleapis"), expect.stringContaining("groq")]);
    fetchMock.mockClear();
    await chat([{ role: "user", content: "q" }]);
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([expect.stringContaining("groq")]);
  });

  it("tries every provider and reports them all when none work", async () => {
    free();
    vi.stubGlobal("fetch", vi.fn(async () => bad(503)));
    await expect(chat([{ role: "user", content: "q" }])).rejects.toThrow(/All AI providers failed \(Gemini: 503, Groq: 503, OpenRouter: 503\)/);
  });

  it("falls through network errors too", async () => {
    free();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { if (String(url).includes("googleapis")) throw new TypeError("fetch failed"); return reply("ok"); }));
    await expect(chat([{ role: "user", content: "q" }])).resolves.toBe("ok");
  });
});

describe("request time budget", () => {
  it("stops waiting on slow providers before the deadline instead of letting the request time out", async () => {
    vi.stubEnv("GEMINI_API_KEY", "g"); vi.stubEnv("GROQ_API_KEY", "q");
    // A provider that never answers until it is aborted.
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise((_, reject) => {
      init.signal!.addEventListener("abort", () => reject(Object.assign(new Error("timed out"), { name: "TimeoutError" })));
    })));
    const started = Date.now();
    const err = await withAiDeadline(4_000, () => chat([{ role: "user", content: "q" }])).catch((e) => e);
    const took = Date.now() - started;
    expect(err).toBeInstanceOf(AiProviderError);
    expect(String(err.message)).toMatch(/too slow|enough time/);
    expect(took).toBeLessThan(4_500);
  }, 10_000);
});
