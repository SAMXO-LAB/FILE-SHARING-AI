import "server-only";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { telegramConfig } from "@/lib/env";
import { createFileFromBytes } from "@/lib/files/create";
import { enqueueJob } from "@/lib/processing/jobs";
import type { JobRow } from "@/lib/types";

/**
 * Telegram bot integration (Bot API, webhook mode).
 *
 * What a bot CAN see: messages and files that users send to it directly (and forwards). What it
 * CANNOT see: a user's other chats, Secret Chats, or history from before they messaged the bot.
 * Linking works with a one-time code the user creates while signed in; the bot never asks for a
 * phone number, password or login code.
 */

const API = "https://api.telegram.org";
const MAX_BOT_FILE = 20 * 1024 * 1024; // Bot API getFile limit

export function hashLinkCode(code: string): string {
  return crypto.createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

export function generateLinkCode(): string {
  // 8 chars from an unambiguous alphabet (~40 bits), single use, 15 minute expiry.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function verifyWebhookSecret(header: string | null): boolean {
  const cfg = telegramConfig();
  if (!cfg || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(cfg.webhookSecret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function tg<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const cfg = telegramConfig();
  if (!cfg) throw new Error("Telegram is not configured.");
  const res = await fetch(`${API}/bot${cfg.botToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!res.ok || !data.ok) throw new Error(`Telegram API ${method} failed: ${data.description ?? res.status}`);
  return data.result as T;
}

async function reply(chatId: number, text: string) {
  try {
    await tg("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true });
  } catch {
    /* a failed acknowledgement must never fail ingestion */
  }
}

export async function setWebhook(publicUrl: string): Promise<void> {
  const cfg = telegramConfig();
  if (!cfg) throw new Error("Telegram is not configured.");
  await tg("setWebhook", {
    url: publicUrl,
    secret_token: cfg.webhookSecret,
    allowed_updates: ["message"],
    drop_pending_updates: false,
  });
}

// --- Telegram update shapes (only what we use) -------------------------------------------------
interface TgUser { id: number; first_name?: string; last_name?: string; username?: string }
interface TgFileRef { file_id: string; file_size?: number; file_name?: string; mime_type?: string }
interface TgMessage {
  message_id: number;
  date: number;
  chat: { id: number; type: string };
  from?: TgUser;
  text?: string;
  caption?: string;
  forward_origin?: { type: string; sender_user?: TgUser; sender_user_name?: string; chat?: { title?: string } };
  document?: TgFileRef;
  photo?: (TgFileRef & { width: number; height: number })[];
  video?: TgFileRef;
  audio?: TgFileRef;
  voice?: TgFileRef;
  animation?: TgFileRef;
}
export interface TgUpdate { update_id: number; message?: TgMessage }

function userLabel(u?: TgUser): string | null {
  if (!u) return null;
  const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return name || (u.username ? `@${u.username}` : null);
}

function pickAttachment(m: TgMessage): { ref: TgFileRef; name: string; mime: string | null } | null {
  if (m.document) return { ref: m.document, name: m.document.file_name ?? `document-${m.message_id}`, mime: m.document.mime_type ?? null };
  if (m.photo?.length) {
    const biggest = [...m.photo].sort((a, b) => (b.file_size ?? b.width * b.height) - (a.file_size ?? a.width * a.height))[0]!;
    return { ref: biggest, name: `photo-${m.message_id}.jpg`, mime: "image/jpeg" };
  }
  if (m.video) return { ref: m.video, name: m.video.file_name ?? `video-${m.message_id}.mp4`, mime: m.video.mime_type ?? "video/mp4" };
  if (m.audio) return { ref: m.audio, name: m.audio.file_name ?? `audio-${m.message_id}.mp3`, mime: m.audio.mime_type ?? "audio/mpeg" };
  if (m.voice) return { ref: m.voice, name: `voice-${m.message_id}.ogg`, mime: m.voice.mime_type ?? "audio/ogg" };
  if (m.animation) return { ref: m.animation, name: m.animation.file_name ?? `animation-${m.message_id}.mp4`, mime: m.animation.mime_type ?? "video/mp4" };
  return null;
}

const HELP =
  "I save what you send me into your Universal AI Memory.\n\n" +
  "To link this chat: open Connected Apps → Telegram in the web app, create a link code, then send /start <code> here.\n\n" +
  "Commands: /status, /disconnect.\n\n" +
  "I can only see messages you send to me directly. I can't read your other chats or Secret Chats.";

/** Handles one Telegram update. Idempotent: Telegram may deliver the same update more than once. */
export async function handleTelegramUpdate(admin: SupabaseClient, update: TgUpdate): Promise<void> {
  const m = update.message;
  if (!m) return;
  const chatId = m.chat.id;

  if (m.chat.type !== "private") {
    if (m.text?.startsWith("/")) await reply(chatId, "I only work in private chats. Message me directly to save things.");
    return;
  }

  const text = (m.text ?? "").trim();

  if (text.startsWith("/start")) {
    const code = text.split(/\s+/)[1];
    if (!code) return void (await reply(chatId, HELP));
    const { data: row } = await admin
      .from("telegram_link_codes")
      .select("id,owner_id,expires_at,used_at")
      .eq("code_hash", hashLinkCode(code))
      .maybeSingle();
    if (!row || row.used_at || new Date(row.expires_at as string) < new Date()) {
      return void (await reply(chatId, "That link code is invalid or has expired. Create a new one in the web app (Connected Apps → Telegram)."));
    }
    // A chat can belong to only one account at a time.
    const { data: taken } = await admin
      .from("source_connections")
      .select("id,owner_id")
      .eq("kind", "telegram_bot")
      .eq("external_id", String(chatId))
      .in("status", ["connected", "pending"])
      .maybeSingle();
    if (taken && taken.owner_id !== row.owner_id) {
      return void (await reply(chatId, "This Telegram account is already linked to a different account. Send /disconnect from the account that owns it first."));
    }
    const label = userLabel(m.from) ?? "Telegram";
    const { error: claimErr } = await admin.from("telegram_link_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id).is("used_at", null);
    if (claimErr) return void (await reply(chatId, "Something went wrong linking your account. Please try again."));
    if (taken) {
      await admin.from("source_connections").update({ status: "connected", display_name: label, last_error: null }).eq("id", taken.id);
    } else {
      await admin.from("source_connections").insert({
        owner_id: row.owner_id,
        source_id: "telegram",
        kind: "telegram_bot",
        status: "connected",
        display_name: label,
        external_id: String(chatId),
        permissions: ["receive_messages_sent_to_bot"],
      });
    }
    await admin.rpc("write_audit", { p_user: row.owner_id, p_event: "integration.telegram_linked", p_target_type: "source_connection", p_target_id: String(chatId), p_metadata: {} });
    return void (await reply(chatId, `Linked ✓  Anything you send me from now on is saved to your memory. Send /status to check, /disconnect to unlink.`));
  }

  const { data: conn } = await admin
    .from("source_connections")
    .select("id,owner_id,display_name")
    .eq("kind", "telegram_bot")
    .eq("external_id", String(chatId))
    .eq("status", "connected")
    .maybeSingle();

  if (text === "/help") return void (await reply(chatId, HELP));
  if (!conn) return void (await reply(chatId, "This chat isn't linked yet. " + HELP));

  if (text === "/disconnect") {
    await admin.from("source_connections").update({ status: "disconnected", external_id: null }).eq("id", conn.id);
    await admin.rpc("write_audit", { p_user: conn.owner_id, p_event: "integration.telegram_disconnected", p_target_type: "source_connection", p_target_id: String(conn.id), p_metadata: {} });
    return void (await reply(chatId, "Disconnected. I will no longer save anything you send. Messages already saved stay in your memory until you delete them in Connected Apps."));
  }
  if (text === "/status") {
    const { count } = await admin.from("messages").select("id", { count: "exact", head: true }).eq("owner_id", conn.owner_id).like("dedupe_key", `tg:${chatId}:%`);
    return void (await reply(chatId, `Linked as ${conn.display_name ?? "your Telegram account"}. ${count ?? 0} message${count === 1 ? "" : "s"} saved.`));
  }
  if (text.startsWith("/")) return void (await reply(chatId, "Unknown command. " + HELP));

  // ---- Save the message ----------------------------------------------------------------------
  const ownerId = conn.owner_id as string;
  const { data: convRow, error: convErr } = await admin
    .from("conversations")
    .upsert(
      { owner_id: ownerId, source_id: "telegram", connection_id: conn.id, title: "Telegram bot inbox", external_key: `bot:${chatId}` },
      { onConflict: "owner_id,source_id,external_key" },
    )
    .select("id")
    .single();
  if (convErr || !convRow) throw new Error(`Could not open the Telegram inbox (${convErr?.message}).`);
  const conversationId = convRow.id as string;

  const fwd = m.forward_origin;
  const forwardedFrom = fwd ? userLabel(fwd.sender_user) ?? fwd.sender_user_name ?? fwd.chat?.title ?? null : null;
  const body = (m.text ?? m.caption ?? "").trim();
  const att = pickAttachment(m);
  const tooBig = att && (att.ref.file_size ?? 0) > MAX_BOT_FILE;

  const { data: inserted, error: msgErr } = await admin
    .from("messages")
    .upsert(
      {
        owner_id: ownerId,
        conversation_id: conversationId,
        src_index: m.message_id,
        sender_label: forwardedFrom ?? (conn.display_name as string | null) ?? "You",
        sender_kind: forwardedFrom ? "label" : "linked_account",
        sent_at: new Date(m.date * 1000).toISOString(),
        body: [forwardedFrom ? `(forwarded from ${forwardedFrom})` : "", body, tooBig ? "[attachment is over Telegram's 20 MB bot limit and was not saved]" : ""].filter(Boolean).join(" "),
        kind: att && !tooBig ? "media" : "text",
        attachment_name: att && !tooBig ? att.name : null,
        dedupe_key: `tg:${chatId}:${m.message_id}`,
      },
      { onConflict: "conversation_id,dedupe_key", ignoreDuplicates: true },
    )
    .select("id");
  if (msgErr) throw new Error(`Could not save the Telegram message (${msgErr.message}).`);
  if (!inserted || inserted.length === 0) return; // duplicate delivery

  await admin.rpc("renumber_conversation", { p_conversation: conversationId });
  await admin.rpc("refresh_conversation_stats", { p_conversation: conversationId });
  await admin.from("source_connections").update({ last_synced_at: new Date().toISOString(), last_error: null }).eq("id", conn.id);

  if (att && !tooBig) {
    await enqueueJob(admin, ownerId, "telegram_ingest", {
      messageId: inserted[0]!.id,
      conversationId,
      tgFileId: att.ref.file_id,
      name: att.name,
      mime: att.mime,
      sender: forwardedFrom ?? (conn.display_name as string | null),
      sentAt: new Date(m.date * 1000).toISOString(),
    });
  }
  await enqueueJob(admin, ownerId, "process_import", { conversationId }, { dedupeKey: `reindex:${conversationId}`, delaySeconds: 20 });
  await reply(chatId, tooBig ? "Saved the text. That file is over Telegram's 20 MB bot limit, so upload it in the web app instead." : "Saved ✓");
}

/** Downloads a Telegram attachment and stores it as a normal file. */
export async function ingestTelegramAttachment(admin: SupabaseClient, job: JobRow): Promise<Record<string, unknown>> {
  const cfg = telegramConfig();
  if (!cfg) throw new Error("Telegram is not configured.");
  const p = job.payload as { messageId: string; conversationId: string; tgFileId: string; name: string; mime: string | null; sender: string | null; sentAt: string };
  const info = await tg<{ file_path?: string; file_size?: number }>("getFile", { file_id: p.tgFileId });
  if (!info.file_path) throw new Error("Telegram did not return a download path for this file.");
  if ((info.file_size ?? 0) > MAX_BOT_FILE) throw new Error("File is over the Bot API download limit.");
  const res = await fetch(`${API}/file/bot${cfg.botToken}/${info.file_path}`, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Telegram file download failed (${res.status}).`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const created = await createFileFromBytes(admin, {
    ownerId: job.owner_id,
    name: p.name,
    bytes,
    sourceId: "telegram",
    conversationId: p.conversationId,
    senderLabel: p.sender,
    originalDate: new Date(p.sentAt),
    declaredMime: p.mime,
  });
  if (!created.ok) {
    await admin.from("messages").update({ body: `[attachment not saved: ${created.message}]`, kind: "text", attachment_name: null }).eq("id", p.messageId);
    return { saved: false, reason: created.message };
  }
  await admin.from("messages").update({ attachment_file_id: created.file.id }).eq("id", p.messageId);
  return { saved: true, fileId: created.file.id };
}
