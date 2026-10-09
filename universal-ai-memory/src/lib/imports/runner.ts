import "server-only";
import crypto from "node:crypto";
import { unzipSync } from "fflate";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPolicy } from "@/lib/ai/policy";
import { createFileFromBytes } from "@/lib/files/create";
import { limits } from "@/lib/env";
import { enqueueJob, PermanentJobError } from "@/lib/processing/jobs";
import { embedRecords, insertRecords, type IndexRecordInput } from "@/lib/processing/index-writer";
import { decodeText } from "@/lib/processing/text";
import { purgeFiles } from "@/lib/processing/pipeline";
import { downloadObject } from "@/lib/storage/objects";
import type { FileRow, JobRow } from "@/lib/types";
import { parseTelegramExport, TelegramExportError } from "./telegram-export";
import { parseWhatsAppExport, whatsappTitleFromFilename, type DateOrder } from "./whatsapp";
import { buildWindows, type WindowMessage } from "./windows";

export interface ImportOptions {
  title?: string;
  tzOffsetMinutes?: number;
  dateOrder?: DateOrder | "auto";
}

interface NormalizedMessage {
  index: number;
  sender: string | null;
  sentAt: Date | null;
  body: string;
  kind: "text" | "media" | "system" | "deleted";
  attachmentName: string | null;
  attachmentKey: string | null;
  dedupeKey: string;
}

interface ZipIndex {
  entries: Map<string, number>; // path -> uncompressed size
  data: Uint8Array;
}

const MAX_MEDIA_ENTRY = 100 * 1024 * 1024;

function indexZip(data: Uint8Array): ZipIndex {
  const entries = new Map<string, number>();
  unzipSync(data, {
    filter: (f) => {
      if (!f.name.endsWith("/") && !f.name.startsWith("__MACOSX/")) entries.set(f.name, f.originalSize);
      return false;
    },
  });
  return { entries, data };
}

function readZipEntry(zip: ZipIndex, name: string): Uint8Array | null {
  const out = unzipSync(zip.data, { filter: (f) => f.name === name });
  return out[name] ?? null;
}

function isZip(b: Uint8Array) {
  return b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5);
}

function findEntry(zip: ZipIndex, wanted: string): string | null {
  const lower = wanted.toLowerCase().replace(/^\.?\//, "");
  for (const name of zip.entries.keys()) {
    if (name.toLowerCase() === lower || name.toLowerCase().endsWith(`/${lower}`)) return name;
  }
  return null;
}

async function setBatch(admin: SupabaseClient, id: string, patch: Record<string, unknown>) {
  await admin.from("import_batches").update(patch).eq("id", id);
}

async function upsertConversation(
  admin: SupabaseClient,
  p: { ownerId: string; sourceId: string; connectionId: string | null; batchId: string | null; title: string; externalKey: string; participants: string[] },
): Promise<string> {
  const { data: existing } = await admin
    .from("conversations")
    .select("id")
    .eq("owner_id", p.ownerId)
    .eq("source_id", p.sourceId)
    .eq("external_key", p.externalKey)
    .maybeSingle();
  if (existing) return existing.id as string;
  const { data, error } = await admin
    .from("conversations")
    .insert({
      owner_id: p.ownerId,
      source_id: p.sourceId,
      connection_id: p.connectionId,
      import_batch_id: p.batchId,
      title: p.title,
      external_key: p.externalKey,
      participants: p.participants,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Could not create the conversation (${error?.message}).`);
  return data.id as string;
}

interface ChatImportStats {
  parsed: number;
  inserted: number;
  duplicates: number;
  attachmentsReferenced: number;
  attachmentsImported: number;
  attachmentsMissing: number;
  attachmentsSkipped: number;
}

/** Shared by WhatsApp and Telegram: persists messages, attaches media, rebuilds the conversation index. */
async function importChat(
  admin: SupabaseClient,
  p: {
    ownerId: string;
    sourceId: "whatsapp" | "telegram";
    connectionId: string | null;
    batchId: string;
    title: string;
    externalKey: string;
    participants: string[];
    messages: NormalizedMessage[];
    zip: ZipIndex | null;
    warnings: string[];
  },
): Promise<{ conversationId: string; stats: ChatImportStats }> {
  const conversationId = await upsertConversation(admin, p);
  const stats: ChatImportStats = { parsed: p.messages.length, inserted: 0, duplicates: 0, attachmentsReferenced: 0, attachmentsImported: 0, attachmentsMissing: 0, attachmentsSkipped: 0 };

  for (let i = 0; i < p.messages.length; i += 500) {
    const batch = p.messages.slice(i, i + 500).map((m) => ({
      owner_id: p.ownerId,
      conversation_id: conversationId,
      import_batch_id: p.batchId,
      src_index: m.index,
      sender_label: m.sender,
      sender_kind: "label",
      sent_at: m.sentAt?.toISOString() ?? null,
      body: m.body,
      kind: m.kind,
      attachment_name: m.attachmentName,
      dedupe_key: m.dedupeKey,
    }));
    const { data, error } = await admin
      .from("messages")
      .upsert(batch, { onConflict: "conversation_id,dedupe_key", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(`Could not save messages (${error.message}).`);
    stats.inserted += data?.length ?? 0;
  }
  stats.duplicates = stats.parsed - stats.inserted;

  // Attachments: match export media files to messages and store them as real files.
  const withAttachments = p.messages.filter((m) => m.attachmentName);
  stats.attachmentsReferenced = withAttachments.length;
  if (withAttachments.length) {
    const keys = withAttachments.map((m) => m.dedupeKey);
    const rows: { id: string; dedupe_key: string; attachment_file_id: string | null }[] = [];
    for (let i = 0; i < keys.length; i += 200) {
      const { data } = await admin.from("messages").select("id,dedupe_key,attachment_file_id").eq("conversation_id", conversationId).in("dedupe_key", keys.slice(i, i + 200));
      rows.push(...((data ?? []) as typeof rows));
    }
    const byKey = new Map(rows.map((r) => [r.dedupe_key, r]));
    let storageFull = false;
    for (const m of withAttachments) {
      const row = byKey.get(m.dedupeKey);
      if (!row || row.attachment_file_id) continue; // already imported earlier
      const entryName = p.zip && m.attachmentKey ? findEntry(p.zip, m.attachmentKey) : null;
      if (!p.zip || !entryName) {
        stats.attachmentsMissing++;
        continue;
      }
      if (storageFull) {
        stats.attachmentsSkipped++;
        continue;
      }
      if ((p.zip.entries.get(entryName) ?? 0) > MAX_MEDIA_ENTRY) {
        stats.attachmentsSkipped++;
        continue;
      }
      const bytes = readZipEntry(p.zip, entryName);
      if (!bytes) {
        stats.attachmentsMissing++;
        continue;
      }
      const res = await createFileFromBytes(admin, {
        ownerId: p.ownerId,
        name: m.attachmentName ?? entryName.split("/").pop() ?? "attachment",
        bytes,
        sourceId: p.sourceId,
        conversationId,
        importBatchId: p.batchId,
        senderLabel: m.sender,
        originalDate: m.sentAt,
      });
      if (res.ok) {
        await admin.from("messages").update({ attachment_file_id: res.file.id }).eq("id", row.id);
        stats.attachmentsImported++;
      } else {
        stats.attachmentsSkipped++;
        if (res.reason === "quota") {
          storageFull = true;
          p.warnings.push("Your storage filled up, so remaining attachments were skipped.");
        }
      }
    }
    if (stats.attachmentsMissing > 0) {
      p.warnings.push(
        p.zip
          ? `${stats.attachmentsMissing} attachment${stats.attachmentsMissing === 1 ? " is" : "s are"} referenced in the chat but not present in the export.`
          : `${stats.attachmentsMissing} attachment${stats.attachmentsMissing === 1 ? " is" : "s are"} referenced but this export has no media. Export "with media" and import the .zip to include them.`,
      );
    }
    if (stats.attachmentsSkipped > 0) p.warnings.push(`${stats.attachmentsSkipped} attachment${stats.attachmentsSkipped === 1 ? " was" : "s were"} skipped (blocked type, too large, or no storage left).`);
  }

  await admin.rpc("renumber_conversation", { p_conversation: conversationId });
  await admin.rpc("refresh_conversation_stats", { p_conversation: conversationId });
  await reindexConversation(admin, conversationId);
  return { conversationId, stats };
}

/** Rebuilds the searchable windows of a conversation (after an import or new bot messages). */
export async function reindexConversation(admin: SupabaseClient, conversationId: string): Promise<void> {
  const { data: conv } = await admin.from("conversations").select("*").eq("id", conversationId).maybeSingle();
  if (!conv) return;
  const policy = await loadPolicy(admin, conv.owner_id as string);

  const { error: delErr } = await admin.from("memory_records").delete().eq("conversation_id", conversationId).eq("kind", "message_window");
  if (delErr) throw new Error(`Could not clear the old conversation index (${delErr.message}).`);

  const base = {
    owner_id: conv.owner_id as string,
    kind: "message_window" as const,
    source_id: conv.source_id as string,
    conversation_id: conversationId,
    import_batch_id: null,
  };

  if (!policy.extractText) {
    await insertRecords(admin, [{ ...base, title: conv.title as string, body: "", occurred_at: conv.last_message_at as string | null, date_kind: "sent" }]);
    return;
  }

  const messages: WindowMessage[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("messages")
      .select("seq,sender_label,sent_at,body,kind,attachment_name")
      .eq("conversation_id", conversationId)
      .order("seq", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`Could not read messages (${error.message}).`);
    for (const m of data ?? []) {
      messages.push({ seq: m.seq as number, sender: m.sender_label as string | null, sentAt: m.sent_at as string | null, body: m.body as string, kind: m.kind as WindowMessage["kind"], attachmentName: m.attachment_name as string | null });
    }
    if (!data || data.length < 1000) break;
  }

  const windows = buildWindows(messages);
  const rows: IndexRecordInput[] = windows.map((w) => ({
    ...base,
    title: conv.title as string,
    body: w.body,
    seq_from: w.seqFrom,
    seq_to: w.seqTo,
    senders: w.senders,
    occurred_at: w.occurredAt,
    date_kind: "sent",
  }));
  if (rows.length === 0) {
    rows.push({ ...base, title: conv.title as string, body: "", occurred_at: conv.last_message_at as string | null, date_kind: "sent" });
  }
  const ids = await insertRecords(admin, rows);

  if (policy.embed) {
    try {
      await embedRecords(admin, rows.map((r, i) => ({ id: ids[i]!, title: r.title, body: r.body })).filter((r) => r.body.trim()));
    } catch {
      await enqueueJob(admin, conv.owner_id as string, "embed_pending", {}, { dedupeKey: `embed:${conv.owner_id}`, delaySeconds: 300 }).catch(() => {});
    }
  }
}

function pickChatEntry(zip: ZipIndex, kind: "whatsapp_export" | "telegram_export"): string | null {
  const names = [...zip.entries.keys()];
  if (kind === "telegram_export") {
    return names.find((n) => /(^|\/)result\.json$/i.test(n)) ?? names.find((n) => /\.json$/i.test(n)) ?? null;
  }
  const txts = names.filter((n) => /\.txt$/i.test(n) && !n.includes("/__MACOSX"));
  return txts.find((n) => /(^|\/)_chat\.txt$/i.test(n)) ?? txts.sort((a, b) => (zip.entries.get(b) ?? 0) - (zip.entries.get(a) ?? 0))[0] ?? null;
}

/** The uploaded export is only a transport: once imported, the raw file is deleted (messages are the record). */
async function dropImportSource(admin: SupabaseClient, ownerId: string, fileId: string | null) {
  if (!fileId) return;
  try {
    await purgeFiles(admin, ownerId, [fileId]);
  } catch (e) {
    console.error("[import] could not remove the export file:", (e as Error).message.slice(0, 160));
  }
}

/** Runs one import batch. Expected problems fail the batch with an actionable message (no retry). */
export async function runImportBatch(admin: SupabaseClient, batchId: string, options: ImportOptions): Promise<void> {
  const { data: batchData } = await admin.from("import_batches").select("*").eq("id", batchId).maybeSingle();
  if (!batchData) return;
  const batch = batchData as { id: string; owner_id: string; kind: "whatsapp_export" | "telegram_export"; file_id: string; connection_id: string | null };
  const fail = async (message: string): Promise<never> => {
    await setBatch(admin, batchId, { status: "failed", error: message, completed_at: new Date().toISOString() });
    if (batch.connection_id) await admin.from("source_connections").update({ last_error: message }).eq("id", batch.connection_id);
    throw new PermanentJobError(message);
  };

  await setBatch(admin, batchId, { status: "processing", error: null });
  const { data: fileData } = await admin.from("files").select("*").eq("id", batch.file_id).maybeSingle();
  const file = fileData as FileRow | null;
  if (!file) return fail("The uploaded export could not be found.");
  if (file.size_bytes > limits.maxImportBytes) {
    return fail(`This export is larger than the ${Math.round(limits.maxImportBytes / 1048576)} MB import limit. Export without media, or split the chat.`);
  }

  const bytes = await downloadObject(admin, file.storage_key);
  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  const { data: dup } = await admin
    .from("import_batches")
    .select("id,created_at")
    .eq("owner_id", batch.owner_id)
    .eq("kind", batch.kind)
    .eq("content_hash", hash)
    .neq("id", batchId)
    .in("status", ["completed", "completed_with_warnings", "processing"])
    .limit(1);
  if (dup && dup[0]) {
    await setBatch(admin, batchId, {
      status: "completed_with_warnings",
      stats: { duplicateOf: dup[0].id, messagesNew: 0 },
      warnings: [`This exact export was already imported on ${new Date(dup[0].created_at as string).toLocaleDateString("en-GB")}; nothing new was added.`],
      completed_at: new Date().toISOString(),
    });
    await dropImportSource(admin, batch.owner_id, batch.file_id);
    return;
  }
  await setBatch(admin, batchId, { content_hash: hash });

  let zip: ZipIndex | null = null;
  let chatBytes = bytes;
  let chatName = file.display_name;
  if (isZip(bytes)) {
    try {
      zip = indexZip(bytes);
    } catch {
      return fail("The .zip file is damaged and couldn't be opened.");
    }
    const entry = pickChatEntry(zip, batch.kind);
    if (!entry) {
      return fail(batch.kind === "whatsapp_export" ? "No chat text file (.txt) was found inside the .zip." : "No result.json was found inside the .zip. Export the chat as JSON from Telegram Desktop.");
    }
    if ((zip.entries.get(entry) ?? 0) > limits.maxImportBytes) return fail("The chat file inside the .zip is too large to import.");
    chatBytes = readZipEntry(zip, entry) ?? new Uint8Array();
    chatName = entry.split("/").pop() ?? entry;
  }

  const warnings: string[] = [];
  const totals: Record<string, number> = { conversations: 0, messagesParsed: 0, messagesNew: 0, messagesDuplicate: 0, attachmentsImported: 0, attachmentsMissing: 0, attachmentsSkipped: 0 };
  const conversationIds: string[] = [];

  const accumulate = (r: { conversationId: string; stats: ChatImportStats }) => {
    conversationIds.push(r.conversationId);
    totals.conversations! += 1;
    totals.messagesParsed! += r.stats.parsed;
    totals.messagesNew! += r.stats.inserted;
    totals.messagesDuplicate! += r.stats.duplicates;
    totals.attachmentsImported! += r.stats.attachmentsImported;
    totals.attachmentsMissing! += r.stats.attachmentsMissing;
    totals.attachmentsSkipped! += r.stats.attachmentsSkipped;
  };

  if (batch.kind === "whatsapp_export") {
    const parsed = parseWhatsAppExport(decodeText(chatBytes), { tzOffsetMinutes: options.tzOffsetMinutes, dateOrder: options.dateOrder });
    if (parsed.messages.length === 0) {
      return fail("No messages were recognised. This doesn't look like a WhatsApp “Export chat” text file (expected lines like “12/31/23, 9:41 PM - Name: message”).");
    }
    warnings.push(...parsed.warnings);
    const title = (options.title?.trim() || whatsappTitleFromFilename(zip ? chatName : file.display_name)).slice(0, 120);
    accumulate(
      await importChat(admin, {
        ownerId: batch.owner_id,
        sourceId: "whatsapp",
        connectionId: batch.connection_id,
        batchId,
        title,
        externalKey: `wa:${title.toLowerCase()}`,
        participants: parsed.participants,
        zip,
        warnings,
        messages: parsed.messages.map((m) => ({
          index: m.index, sender: m.sender, sentAt: m.sentAt, body: m.body, kind: m.kind,
          attachmentName: m.attachmentName, attachmentKey: m.attachmentName, dedupeKey: m.dedupeKey,
        })),
      }),
    );
  } else {
    let chats;
    try {
      chats = parseTelegramExport(decodeText(chatBytes), options.title?.trim() || "Telegram chat");
    } catch (e) {
      if (e instanceof TelegramExportError) return fail(e.message);
      throw e;
    }
    warnings.push("Telegram exports include a local timestamp and a UTC one; the UTC value was used.");
    for (const chat of chats) {
      const title = (chats.length === 1 && options.title?.trim() ? options.title.trim() : chat.title).slice(0, 120);
      accumulate(
        await importChat(admin, {
          ownerId: batch.owner_id,
          sourceId: "telegram",
          connectionId: batch.connection_id,
          batchId,
          title,
          externalKey: `tg:${chat.externalId}`,
          participants: chat.participants,
          zip,
          warnings,
          messages: chat.messages.map((m) => ({
            index: m.index, sender: m.sender, sentAt: m.sentAt, body: m.body, kind: m.kind,
            attachmentName: m.attachmentName, attachmentKey: m.attachmentPath, dedupeKey: m.dedupeKey,
          })),
        }),
      );
    }
  }

  const hasWarnings = warnings.some((w) => !/time zone/i.test(w)) || totals.attachmentsMissing! > 0;
  await setBatch(admin, batchId, {
    status: hasWarnings ? "completed_with_warnings" : "completed",
    stats: { ...totals, conversationIds },
    warnings: [...new Set(warnings)],
    completed_at: new Date().toISOString(),
  });
  if (batch.connection_id) {
    await admin.from("source_connections").update({ last_synced_at: new Date().toISOString(), last_error: null, status: "connected" }).eq("id", batch.connection_id);
  }
  await dropImportSource(admin, batch.owner_id, batch.file_id);
}

export async function processImportJob(admin: SupabaseClient, job: JobRow): Promise<Record<string, unknown>> {
  const p = job.payload as { batchId?: string; options?: ImportOptions; conversationId?: string };
  if (p.batchId) {
    await runImportBatch(admin, p.batchId, p.options ?? {});
    return { batchId: p.batchId };
  }
  if (p.conversationId) {
    await reindexConversation(admin, p.conversationId);
    return { conversationId: p.conversationId };
  }
  throw new PermanentJobError("Import job has no target.");
}
