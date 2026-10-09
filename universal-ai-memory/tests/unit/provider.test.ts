import { afterEach, describe, expect, it, vi } from "vitest";
import { chat } from "@/lib/ai/provider";
import { embedTexts } from "@/lib/ai/embeddings";

const ENV = { AI_PROVIDER: "openai-compatible", AI_BASE_URL: "https://provider.test/v1", AI_API_KEY: "k", AI_MODEL: "free-model", EMBEDDING_MODEL: "gemini-embedding-001" };
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const bad = (status: number) => new Response(JSON.stringify({ error: { message: "unsupported" } }), { status, headers: { "content-type": "application/json" } });

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

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
