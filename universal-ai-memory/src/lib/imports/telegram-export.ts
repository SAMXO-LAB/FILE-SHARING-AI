/**
 * Telegram Desktop "Export chat history" (JSON) parser.
 *
 * Supports a single-chat export ({name, messages}) and a full-account export ({chats:{list}}).
 * HTML exports are not supported; ask the user to re-export as JSON.
 */
import crypto from "node:crypto";

export interface TgParsedMessage {
  index: number;
  sender: string | null;
  sentAt: Date | null;
  body: string;
  kind: "text" | "media" | "system";
  attachmentPath: string | null;
  attachmentName: string | null;
  dedupeKey: string;
}

export interface TgParsedChat {
  externalId: string;
  title: string;
  type: string | null;
  messages: TgParsedMessage[];
  participants: string[];
}

export class TelegramExportError extends Error {}

function flattenText(t: unknown): string {
  if (typeof t === "string") return t;
  if (Array.isArray(t)) {
    return t
      .map((p) => (typeof p === "string" ? p : typeof p === "object" && p && "text" in p ? String((p as { text: unknown }).text ?? "") : ""))
      .join("");
  }
  return "";
}

function parseChat(raw: Record<string, unknown>, fallbackTitle: string): TgParsedChat | null {
  const list = raw.messages;
  if (!Array.isArray(list)) return null;
  const counts = new Map<string, number>();
  const people = new Set<string>();
  const messages: TgParsedMessage[] = [];
  list.forEach((m: Record<string, unknown>, index: number) => {
    if (!m || typeof m !== "object") return;
    const isService = m.type === "service";
    const unix = typeof m.date_unixtime === "string" ? Number(m.date_unixtime) : NaN;
    const sentAt = Number.isFinite(unix) ? new Date(unix * 1000) : typeof m.date === "string" && !Number.isNaN(+new Date(m.date)) ? new Date(m.date) : null;
    const sender = isService ? (typeof m.actor === "string" ? m.actor : null) : typeof m.from === "string" ? m.from : null;
    let body = flattenText(m.text);
    let attachmentPath: string | null = null;
    let attachmentName: string | null = null;
    const file = typeof m.file === "string" ? m.file : typeof m.photo === "string" ? m.photo : null;
    if (file && !file.startsWith("(")) {
      // Exports write "(File not included. Change data exporting settings to download.)" when media was skipped.
      attachmentPath = file;
      attachmentName = typeof m.file_name === "string" ? m.file_name : file.split("/").pop() ?? file;
    }
    const kind: TgParsedMessage["kind"] = isService ? "system" : attachmentPath || m.media_type ? "media" : "text";
    if (isService) body = `${typeof m.action === "string" ? m.action.replace(/_/g, " ") : "service message"}${body ? `: ${body}` : ""}`;
    if (!body && !attachmentPath && !isService && !m.media_type) return; // empty placeholder
    if (sender && !isService) people.add(sender);
    const base = [String(m.id ?? index), sentAt?.toISOString() ?? "", sender ?? "", body, attachmentName ?? ""].join("␟");
    const n = (counts.get(base) ?? 0) + 1;
    counts.set(base, n);
    messages.push({
      index,
      sender,
      sentAt,
      body,
      kind,
      attachmentPath,
      attachmentName,
      dedupeKey: crypto.createHash("sha1").update(`${base}␟${n}`).digest("hex"),
    });
  });
  const id = raw.id !== undefined ? String(raw.id) : crypto.createHash("sha1").update(String(raw.name ?? fallbackTitle)).digest("hex").slice(0, 12);
  return {
    externalId: id,
    title: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : fallbackTitle,
    type: typeof raw.type === "string" ? raw.type : null,
    messages,
    participants: [...people],
  };
}

export function parseTelegramExport(jsonText: string, fallbackTitle = "Telegram chat"): TgParsedChat[] {
  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new TelegramExportError("This file isn't valid JSON. In Telegram Desktop choose “Export chat history” and select the JSON format (HTML exports aren't supported).");
  }
  if (!data || typeof data !== "object") throw new TelegramExportError("This doesn't look like a Telegram export.");
  const obj = data as Record<string, unknown>;
  const chats: TgParsedChat[] = [];
  const chatList = (obj.chats as { list?: unknown } | undefined)?.list;
  if (Array.isArray(chatList)) {
    for (const c of chatList) {
      const parsed = c && typeof c === "object" ? parseChat(c as Record<string, unknown>, fallbackTitle) : null;
      if (parsed && parsed.messages.length) chats.push(parsed);
    }
  } else {
    const single = parseChat(obj, fallbackTitle);
    if (single) chats.push(single);
  }
  if (chats.length === 0) {
    throw new TelegramExportError("No messages were found. Make sure this is a Telegram Desktop JSON export (result.json) that includes messages.");
  }
  return chats;
}
