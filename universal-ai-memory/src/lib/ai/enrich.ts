import "server-only";
import { z } from "zod";
import { chatJson } from "./provider";
import { DOCUMENT_GUARD, fence } from "./prompts";

export const enrichmentSchema = z.object({
  summary: z.string().max(1200),
  topics: z.array(z.string().max(60)).max(12).default([]),
  entities: z.array(z.string().max(80)).max(20).default([]),
  important_dates: z.array(z.string().max(60)).max(10).default([]),
  category: z.string().max(40).default("other"),
  suggested_tags: z.array(z.string().max(30)).max(8).default([]),
});
export type Enrichment = z.infer<typeof enrichmentSchema>;

/**
 * One call per document: summary, topics, entities, dates, category and tags.
 * The document is untrusted data: it is fenced, and the model has no tools. Output is validated.
 */
export async function enrichDocument(name: string, text: string): Promise<Enrichment | null> {
  const excerpt = text.slice(0, 14000);
  return chatJson(
    [
      {
        role: "system",
        content:
          `You analyse a user's document so it can be found later. ${DOCUMENT_GUARD}\n` +
          `Return JSON with keys: summary (2-4 sentences, plain language), topics (short noun phrases), entities (people/orgs/places/products named), ` +
          `important_dates (dates exactly as written in the document; never infer or invent any), category (one of: notes, research, invoice, report, ` +
          `contract, letter, study-material, project, code, data, other), suggested_tags (lowercase, 1-2 words). Omit anything the document does not support.`,
      },
      { role: "user", content: `File name: ${name.slice(0, 200)}\n\n${fence("document", excerpt)}` },
    ],
    enrichmentSchema,
    { maxTokens: 700, temperature: 0.1 },
  );
}
