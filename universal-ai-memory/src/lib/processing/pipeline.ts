import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enrichDocument, type Enrichment } from "@/lib/ai/enrich";
import { loadPolicy, type Policy } from "@/lib/ai/policy";
import { clamavConfigured, limits } from "@/lib/env";
import { scanStream } from "@/lib/security/clamav";
import { categoryFromMime, typeFromName } from "@/lib/files/types";
import { BUCKET, downloadObject, hashObject, removeObjects, signedUrl } from "@/lib/storage/objects";
import type { FileRow } from "@/lib/types";
import { chunkPages, type TextPage } from "./chunk";
import { ExtractionError, extractText, mp4DurationSeconds, type ExtractKind } from "./extract";
import { chunkRecords, deleteRecordsFor, embedRecords, insertRecords, type IndexRecordInput } from "./index-writer";
import { enqueueJob, RetryableError } from "./jobs";
import { ocrImage, transcribeAudio, visionSupported } from "./media";

/** Chooses an extractor from the VERIFIED mime type (never from the client's claim). */
export function extractKindFor(mime: string | null, name: string): ExtractKind | null {
  const m = (mime ?? "").toLowerCase();
  if (m === "application/pdf") return "pdf";
  if (m.includes("wordprocessingml")) return "docx";
  if (m.includes("spreadsheetml")) return "xlsx";
  if (m.includes("presentationml")) return "pptx";
  if (m === "text/html") return "html";
  if (m === "application/json") return "json";
  if (m === "text/csv" || m === "text/tab-separated-values") return "csv";
  if (m === "application/xml" || m === "text/xml") return "xml";
  if (m.startsWith("text/") || m === "application/sql" || m === "application/x-sh") return "text";
  // Unknown but extension says text/code/etc. and the sniffed content is text (checked at upload).
  const byName = typeFromName(name, m).extract;
  return byName && m.startsWith("text") ? byName : null;
}

async function setFile(admin: SupabaseClient, id: string, patch: Record<string, unknown>) {
  const { error } = await admin.from("files").update(patch).eq("id", id);
  if (error) throw new Error(`Could not update the file record (${error.message}).`);
}

function fileDate(file: FileRow): { occurred_at: string; date_kind: "sent" | "modified" | "uploaded" } {
  if (file.original_date) return { occurred_at: file.original_date, date_kind: file.conversation_id ? "sent" : "modified" };
  return { occurred_at: file.created_at, date_kind: "uploaded" };
}

interface ProcessResult {
  status: FileRow["status"];
  detail: string | null;
}

/**
 * Turns an uploaded file into searchable memory. Idempotent: re-running replaces the previous index.
 * Expected problems (encrypted, corrupt, unsupported) become a visible file status; unexpected ones
 * throw so the job system retries.
 */
export async function processFile(admin: SupabaseClient, fileId: string): Promise<ProcessResult> {
  const { data: fileData, error: fileErr } = await admin.from("files").select("*").eq("id", fileId).maybeSingle();
  if (fileErr) throw new Error(`Could not load the file (${fileErr.message}).`);
  const file = fileData as FileRow | null;
  if (!file || file.deleted_at) return { status: "ready", detail: "Skipped (file no longer exists)." };
  if (file.status === "uploading") throw new RetryableError("Upload not finished yet.", 30);

  await setFile(admin, file.id, { status: "processing" });
  const policy = await loadPolicy(admin, file.owner_id);
  const notes: string[] = [];

  // ---- 0. Malware scan (when a ClamAV server is configured; fails closed) ---------------------
  if (clamavConfigured()) {
    const res = await fetch(await signedUrl(admin, file.storage_key, 300));
    if (!res.ok || !res.body) throw new Error(`Could not read the stored file for scanning (HTTP ${res.status}).`);
    const scan = await scanStream(res.body);
    if (scan.status === "infected") {
      await removeObjects(admin, [file.storage_key]).catch(() => {});
      await deleteRecordsFor(admin, file.owner_id, { file_id: file.id });
      await setFile(admin, file.id, {
        status: "failed",
        status_detail: `Blocked: the malware scanner flagged this file (${scan.signature}). The stored copy was deleted.`,
        size_bytes: 0,
      });
      return { status: "failed", detail: "Blocked by malware scan." };
    }
    if (scan.status === "skipped") notes.push(`Not malware-scanned: ${scan.reason}`);
  }

  // ---- 1. Hash (streamed) + duplicate detection -------------------------------------------
  let hash = file.content_hash;
  if (!hash) {
    hash = (await hashObject(admin, file.storage_key)).sha256;
  }
  let duplicateOf: string | null = null;
  {
    const { data: dup } = await admin
      .from("files")
      .select("id,display_name")
      .eq("owner_id", file.owner_id)
      .eq("content_hash", hash)
      .is("deleted_at", null)
      .neq("id", file.id)
      .order("created_at", { ascending: true })
      .limit(1);
    if (dup && dup[0]) {
      duplicateOf = dup[0].id as string;
      notes.push(`Identical to "${dup[0].display_name as string}".`);
    }
  }

  // ---- 2. Extract text ----------------------------------------------------------------------
  const mime = file.mime_type ?? typeFromName(file.display_name, file.declared_mime).mime;
  const kind = extractKindFor(mime, file.display_name);
  let pages: TextPage[] = [];
  let pageCount: number | null = file.page_count;
  let duration: number | null = file.duration_seconds;
  let outcome: ProcessResult["status"] = "ready";
  let level: FileRow["indexing_level"] = "metadata";
  let textSourceLabel: string | null = null;

  try {
    if (!policy.extractText) {
      notes.push("Privacy mode is “metadata only”: contents were not read.");
    } else if (kind && file.size_bytes > limits.maxExtractBytes) {
      notes.push(`File is larger than ${Math.round(limits.maxExtractBytes / 1048576)} MB, so only its name and metadata are searchable.`);
    } else if (kind) {
      const bytes = await downloadObject(admin, file.storage_key);
      const ex = await extractText(kind, bytes, limits.maxExtractedChars);
      pages = ex.pages;
      pageCount = ex.pageCount ?? pageCount;
      notes.push(...ex.notes);
      if (pages.length === 0 && ex.notes.length === 0) notes.push("No readable text was found in this file.");
    } else if (file.category === "image") {
      if (policy.ocr && visionSupported(mime, file.size_bytes)) {
        const text = await ocrImage(await downloadObject(admin, file.storage_key), mime);
        if (text) {
          pages = [{ page: null, text }];
          textSourceLabel = "Text read from the image by AI (may contain errors).";
          notes.push(textSourceLabel);
        } else notes.push("No readable text was found in this image.");
      } else {
        notes.push("Indexed by name only. Image text recognition (OCR) is not enabled for this account or server.");
      }
    } else if (file.category === "audio") {
      if (policy.transcribe && file.size_bytes <= 25 * 1024 * 1024) {
        const text = await transcribeAudio(await downloadObject(admin, file.storage_key), file.display_name, mime);
        if (text) {
          pages = [{ page: null, text }];
          textSourceLabel = "Transcript generated automatically (may contain errors).";
          notes.push(textSourceLabel);
        } else notes.push("No speech was detected.");
      } else {
        notes.push("Indexed by name only. Audio transcription is not enabled for this account or server.");
      }
    } else if (file.category === "video") {
      if (mime === "video/mp4" || mime === "video/quicktime") {
        // Metadata only: read the header region where a "fast-start" file keeps its duration.
        const url = await signedUrl(admin, file.storage_key, 60);
        const head = new Uint8Array(await (await fetch(url, { headers: { Range: "bytes=0-2097151" } })).arrayBuffer());
        duration = mp4DurationSeconds(head) ?? duration;
      }
      notes.push("Videos are indexed by name and metadata.");
    } else if (file.category === "archive") {
      notes.push("Archives are stored but their contents are not indexed.");
    }
  } catch (e) {
    if (e instanceof ExtractionError) {
      outcome = e.code === "corrupt" ? "failed" : "unsupported";
      notes.push(e.message);
    } else {
      throw e;
    }
  }

  // ---- 3. Chunk + AI enrichment -------------------------------------------------------------
  const chunks = chunkPages(pages);
  const fullText = pages.map((p) => p.text).join("\n\n");
  let enrichment: Enrichment | null = null;
  if (policy.enrich && fullText.length >= 200) {
    try {
      enrichment = await enrichDocument(file.display_name, fullText);
      if (!enrichment) notes.push("The AI could not produce a summary for this file.");
    } catch (e) {
      notes.push(`AI summary unavailable: ${(e as Error).message}`);
    }
  }

  // ---- 4. Derived text (kept out of ordinary DB columns) ------------------------------------
  let extractedKey: string | null = null;
  if (fullText) {
    extractedKey = `${file.owner_id}/_derived/${file.id}.json`;
    const payload = JSON.stringify({ pages, label: textSourceLabel });
    const { error } = await admin.storage.from(BUCKET).upload(extractedKey, new Blob([payload], { type: "application/json" }), { upsert: true, contentType: "application/json" });
    if (error) {
      extractedKey = null;
      notes.push("Could not save the extracted text copy; search still works.");
    }
  }

  // ---- 5. Write the index (replace any previous one) ----------------------------------------
  const ai_metadata = enrichment
    ? {
        summary: enrichment.summary,
        topics: enrichment.topics,
        entities: enrichment.entities,
        important_dates: enrichment.important_dates,
        category: enrichment.category,
      }
    : {};
  const suggestedTags = enrichment?.suggested_tags ?? [];
  const tags = [...new Set([...(file.tags ?? []), ...suggestedTags.map((t) => t.toLowerCase())])].slice(0, 20);

  const when = fileDate(file);
  const senders = file.sender_label ? [file.sender_label] : [];
  const base = {
    owner_id: file.owner_id,
    source_id: file.source_id,
    file_id: file.id,
    conversation_id: file.conversation_id,
    import_batch_id: file.import_batch_id,
    title: file.display_name,
    file_category: file.category,
    senders,
    ...when,
  };
  const fileRecordBody = [
    ai_metadata.summary,
    ai_metadata.topics?.length ? `Topics: ${ai_metadata.topics.join(", ")}` : "",
    ai_metadata.entities?.length ? `Mentions: ${ai_metadata.entities.join(", ")}` : "",
    tags.length ? `Tags: ${tags.join(", ")}` : "",
    file.description ?? "",
  ].filter(Boolean).join("\n");

  await deleteRecordsFor(admin, file.owner_id, { file_id: file.id });
  const rows: IndexRecordInput[] = [
    { ...base, kind: "file", body: fileRecordBody },
    ...chunkRecords(base, chunks),
  ];
  if (chunks.length > 0) level = "text";
  const ids = await insertRecords(admin, rows);

  // ---- 6. Embeddings (optional, privacy-gated) ----------------------------------------------
  if (policy.embed && chunks.length > 0) {
    try {
      const toEmbed = rows
        .map((r, i) => ({ id: ids[i]!, title: r.title, body: r.body, kind: r.kind }))
        .filter((r) => r.body.trim() !== "");
      await embedRecords(admin, toEmbed);
      level = "semantic";
    } catch (e) {
      notes.push(`Semantic indexing is pending: ${(e as Error).message} Keyword search already works.`);
      await enqueueJob(admin, file.owner_id, "embed_pending", {}, { dedupeKey: `embed:${file.owner_id}`, delaySeconds: 300 }).catch(() => {});
    }
  }

  await setFile(admin, file.id, {
    status: outcome,
    status_detail: notes.length ? notes.join(" ") : null,
    content_hash: hash,
    duplicate_of: duplicateOf,
    page_count: pageCount,
    duration_seconds: duration,
    extracted_text_key: extractedKey,
    indexing_level: level,
    ai_metadata,
    tags,
    category: file.category === "other" ? categoryFromMime(mime) : file.category,
  });
  return { status: outcome, detail: notes.join(" ") || null };
}

/** Shown on the file when every retry has failed. */
export async function markFileFailed(admin: SupabaseClient, fileId: string, message: string) {
  await admin.from("files").update({ status: "failed", status_detail: `Processing failed: ${message}` }).eq("id", fileId);
}

/** Removes a file's rows, index, derived text and stored objects. Caller must have authorised this. */
export async function purgeFiles(admin: SupabaseClient, ownerId: string, fileIds: string[]): Promise<number> {
  if (fileIds.length === 0) return 0;
  const { data, error } = await admin.from("files").select("id,storage_key,extracted_text_key").eq("owner_id", ownerId).in("id", fileIds);
  if (error) throw new Error(`Could not load files to delete (${error.message}).`);
  const rows = (data ?? []) as { id: string; storage_key: string; extracted_text_key: string | null }[];
  const keys = rows.flatMap((r) => [r.storage_key, r.extracted_text_key]).filter((k): k is string => Boolean(k));
  await removeObjects(admin, keys);
  const { error: delErr } = await admin.from("files").delete().eq("owner_id", ownerId).in("id", rows.map((r) => r.id));
  if (delErr) throw new Error(`Could not delete file records (${delErr.message}).`);
  return rows.length;
}
