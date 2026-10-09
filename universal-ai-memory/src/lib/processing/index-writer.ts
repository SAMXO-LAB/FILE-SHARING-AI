import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { embedTexts, embeddingModelName, toPgVector } from "@/lib/ai/embeddings";
import type { Chunk } from "./chunk";

export interface IndexRecordInput {
  owner_id: string;
  kind: "file" | "chunk" | "message_window" | "link" | "note";
  source_id: string;
  file_id?: string | null;
  link_id?: string | null;
  note_id?: string | null;
  conversation_id?: string | null;
  import_batch_id?: string | null;
  title: string;
  body: string;
  file_category?: string | null;
  chunk_index?: number | null;
  page_start?: number | null;
  page_end?: number | null;
  seq_from?: number | null;
  seq_to?: number | null;
  senders?: string[];
  occurred_at?: string | null;
  date_kind?: "sent" | "modified" | "uploaded" | "imported" | "saved" | "created" | null;
}

export async function insertRecords(admin: SupabaseClient, rows: IndexRecordInput[]): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < rows.length; i += 100) {
    const { data, error } = await admin.from("memory_records").insert(rows.slice(i, i + 100)).select("id");
    if (error) throw new Error(`Could not write the search index (${error.message}).`);
    ids.push(...(data ?? []).map((r: { id: string }) => r.id));
  }
  return ids;
}

export function chunkRecords(
  base: Omit<IndexRecordInput, "kind" | "body" | "chunk_index" | "page_start" | "page_end">,
  chunks: Chunk[],
): IndexRecordInput[] {
  return chunks.map((c) => ({
    ...base,
    kind: "chunk" as const,
    body: c.text,
    chunk_index: c.index,
    page_start: c.pageStart,
    page_end: c.pageEnd,
  }));
}

/** Deletes every index record for a source object (file, link, note). */
export async function deleteRecordsFor(admin: SupabaseClient, ownerId: string, ref: { file_id?: string; link_id?: string; note_id?: string }) {
  let q = admin.from("memory_records").delete().eq("owner_id", ownerId);
  if (ref.file_id) q = q.eq("file_id", ref.file_id);
  else if (ref.link_id) q = q.eq("link_id", ref.link_id);
  else if (ref.note_id) q = q.eq("note_id", ref.note_id);
  else throw new Error("deleteRecordsFor needs a reference");
  const { error } = await q;
  if (error) throw new Error(`Could not clear the old search index (${error.message}).`);
}

/** The text that gets embedded for a record: the title gives context to short passages. */
export function embeddingInput(r: { title: string; body: string }): string {
  return r.title && r.body ? `${r.title}\n\n${r.body}` : r.title || r.body;
}

/** Embeds the given records and stores the vectors. Returns how many were embedded. */
export async function embedRecords(admin: SupabaseClient, records: { id: string; title: string; body: string }[]): Promise<number> {
  const model = embeddingModelName();
  if (!model || records.length === 0) return 0;
  let done = 0;
  for (let i = 0; i < records.length; i += 64) {
    const batch = records.slice(i, i + 64);
    const vectors = await embedTexts(batch.map(embeddingInput));
    const { error } = await admin.rpc("set_embeddings", {
      p_ids: batch.map((b) => b.id),
      p_vectors: vectors.map(toPgVector),
      p_model: model,
    });
    if (error) throw new Error(`Could not store embeddings (${error.message}).`);
    done += batch.length;
  }
  return done;
}

/** Embeds a bounded number of not-yet-embedded records for an owner. */
export async function embedPendingFor(admin: SupabaseClient, ownerId: string, limit = 256): Promise<{ embedded: number; remaining: boolean }> {
  const { data, error } = await admin
    .from("memory_records")
    .select("id,title,body")
    .eq("owner_id", ownerId)
    .is("embedding", null)
    .in("kind", ["chunk", "message_window", "note", "link"])
    .neq("body", "")
    .limit(limit);
  if (error) throw new Error(`Could not find records to embed (${error.message}).`);
  const rows = (data ?? []) as { id: string; title: string; body: string }[];
  const embedded = await embedRecords(admin, rows);
  return { embedded, remaining: rows.length === limit };
}
