import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chat } from "@/lib/ai/provider";
import { DOCUMENT_GUARD, fence } from "@/lib/ai/prompts";
import { loadPolicy } from "@/lib/ai/policy";
import { safeFetch, UnsafeUrlError } from "@/lib/security/ssrf";
import type { LinkRow, NoteRow } from "@/lib/types";
import { chunkPages } from "./chunk";
import { extractPageMeta, htmlToText } from "./html";
import { chunkRecords, deleteRecordsFor, embedRecords, insertRecords, type IndexRecordInput } from "./index-writer";
import { PermanentJobError } from "./jobs";
import { decodeText, normalizeWhitespace } from "./text";

async function setLink(admin: SupabaseClient, id: string, patch: Record<string, unknown>) {
  const { error } = await admin.from("links").update(patch).eq("id", id);
  if (error) throw new Error(`Could not update the link (${error.message}).`);
}

/** Fetches a saved link through the SSRF-safe fetcher and indexes what it finds. */
export async function processLink(admin: SupabaseClient, linkId: string): Promise<void> {
  const { data } = await admin.from("links").select("*").eq("id", linkId).maybeSingle();
  const link = data as LinkRow | null;
  if (!link) return;
  await setLink(admin, link.id, { status: "fetching", status_detail: null });
  const policy = await loadPolicy(admin, link.owner_id);

  let page;
  try {
    page = await safeFetch(link.url);
  } catch (e) {
    if (e instanceof UnsafeUrlError) {
      await setLink(admin, link.id, { status: "failed", status_detail: e.reason });
      throw new PermanentJobError(e.reason);
    }
    throw e;
  }
  if (page.status >= 400) {
    const reason = `The site responded with an error (HTTP ${page.status}).`;
    await setLink(admin, link.id, { status: "failed", status_detail: reason, final_url: page.finalUrl });
    throw new PermanentJobError(reason);
  }

  const raw = decodeText(page.body);
  const isHtml = /html/i.test(page.contentType);
  const meta = isHtml ? extractPageMeta(raw) : { title: null, description: null, siteName: null };
  const fallbackTitle = new URL(page.finalUrl).hostname.replace(/^www\./, "");
  const text = policy.extractText ? (isHtml ? htmlToText(raw) : normalizeWhitespace(raw)).slice(0, 200_000) : "";

  let summary: string | null = null;
  const notes: string[] = [];
  if (link.summary_requested) {
    if (!policy.ai) notes.push("A summary was requested but AI processing isn't enabled in your privacy settings.");
    else if (text.length < 200) notes.push("The page had too little text to summarise.");
    else {
      try {
        summary = (
          await chat(
            [
              { role: "system", content: `Summarise the web page in 3-5 sentences for later reference. ${DOCUMENT_GUARD}` },
              { role: "user", content: fence("web page", `${meta.title ?? ""}\n\n${text.slice(0, 12000)}`) },
            ],
            { maxTokens: 400, temperature: 0.2 },
          )
        ).trim();
      } catch (e) {
        notes.push(`Summary unavailable: ${(e as Error).message}`);
      }
    }
  }
  if (page.truncated) notes.push("The page was very large; only the first part was indexed.");

  const title = meta.title ?? fallbackTitle;
  await deleteRecordsFor(admin, link.owner_id, { link_id: link.id });
  const base = {
    owner_id: link.owner_id,
    source_id: "link",
    link_id: link.id,
    title,
    occurred_at: link.created_at,
    date_kind: "saved" as const,
  };
  const chunks = chunkPages([{ page: null, text }]);
  const rows: IndexRecordInput[] = [
    { ...base, kind: "link", body: [meta.description, summary, `${meta.siteName ?? fallbackTitle} — ${page.finalUrl}`].filter(Boolean).join("\n") },
    ...chunkRecords(base, chunks),
  ];
  const ids = await insertRecords(admin, rows);

  if (policy.embed && chunks.length > 0) {
    try {
      await embedRecords(admin, rows.map((r, i) => ({ id: ids[i]!, title: r.title, body: r.body })));
    } catch (e) {
      notes.push(`Semantic indexing pending: ${(e as Error).message}`);
    }
  }

  await setLink(admin, link.id, {
    status: "ready",
    status_detail: notes.join(" ") || null,
    final_url: page.finalUrl,
    title,
    description: meta.description,
    site_name: meta.siteName ?? fallbackTitle,
    summary,
  });
}

/** (Re)indexes a note. Notes are the user's own text, indexed whenever text extraction is allowed. */
export async function indexNote(admin: SupabaseClient, noteId: string): Promise<void> {
  const { data } = await admin.from("notes").select("*").eq("id", noteId).maybeSingle();
  const note = data as NoteRow | null;
  if (!note) return;
  const policy = await loadPolicy(admin, note.owner_id);
  await deleteRecordsFor(admin, note.owner_id, { note_id: note.id });

  const base = {
    owner_id: note.owner_id,
    source_id: "note",
    note_id: note.id,
    title: note.title,
    occurred_at: note.updated_at,
    date_kind: "created" as const,
  };
  const body = policy.extractText ? note.body : "";
  const chunks = body.length > 1500 ? chunkPages([{ page: null, text: body }]) : [];
  const rows: IndexRecordInput[] = [
    { ...base, kind: "note", body: chunks.length ? body.slice(0, 400) : body },
    ...chunkRecords(base, chunks),
  ];
  const ids = await insertRecords(admin, rows);
  if (policy.embed) {
    try {
      await embedRecords(admin, rows.map((r, i) => ({ id: ids[i]!, title: r.title, body: r.body })).filter((r) => r.body.trim()));
    } catch {
      /* picked up later by embed_pending */
    }
  }
}
