import "server-only";
import { aiConfig, transcriptionConfig } from "@/lib/env";
import { chat } from "@/lib/ai/provider";
import { DOCUMENT_GUARD } from "@/lib/ai/prompts";

const VISION_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_VISION_BYTES = 5 * 1024 * 1024;

export function visionSupported(mime: string, size: number): boolean {
  return VISION_TYPES.has(mime) && size <= MAX_VISION_BYTES;
}

/**
 * OCR with a vision-capable chat model. The result is AI-generated and may contain mistakes; the
 * caller labels it as such. Returns null when the model reports no text.
 */
export async function ocrImage(bytes: Uint8Array, mime: string): Promise<string | null> {
  if (!aiConfig()) throw new Error("No AI provider configured for OCR.");
  const dataUrl = `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
  const out = await chat(
    [
      {
        role: "system",
        content:
          `You transcribe text from images for a search index. ${DOCUMENT_GUARD} ` +
          "Output only the visible text, preserving reading order. If there is no readable text, output exactly: NO_TEXT. Do not describe the image.",
      },
      { role: "user", content: "Transcribe the text in this image.", images: [dataUrl] },
    ],
    { maxTokens: 1500, temperature: 0 },
  );
  const text = out.trim();
  return !text || text === "NO_TEXT" ? null : text;
}

/** Speech-to-text through an OpenAI-compatible /audio/transcriptions endpoint. */
export async function transcribeAudio(bytes: Uint8Array, filename: string, mime: string): Promise<string | null> {
  const cfg = transcriptionConfig();
  if (!cfg) throw new Error("Transcription is not configured.");
  if (bytes.byteLength > 25 * 1024 * 1024) throw new Error("Audio is larger than the 25 MB transcription limit.");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), filename);
  form.append("model", cfg.model);
  form.append("response_format", "json");
  const res = await fetch(`${cfg.baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {},
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`The transcription service returned ${res.status}.`);
  const data = (await res.json()) as { text?: string };
  const t = data.text?.trim();
  return t ? t : null;
}
