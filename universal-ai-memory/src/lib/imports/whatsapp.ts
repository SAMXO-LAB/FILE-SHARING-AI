/**
 * WhatsApp "Export chat" parser.
 *
 * Handles the common Android and iOS text formats, multi-line messages, system lines, deleted
 * messages and attachment markers. It is deliberately forgiving about locale (date order, 12/24h,
 * separators, narrow no-break spaces) and deliberately honest: anything it cannot understand is
 * counted and reported instead of being guessed.
 */
import crypto from "node:crypto";

export type DateOrder = "dmy" | "mdy" | "ymd";

export interface ParsedMessage {
  /** Position in the source file (stable across re-imports of the same export). */
  index: number;
  sender: string | null;
  sentAt: Date | null;
  rawTimestamp: string;
  body: string;
  kind: "text" | "media" | "system" | "deleted";
  attachmentName: string | null;
  dedupeKey: string;
}

export interface ParseOptions {
  /** Minutes like Date.getTimezoneOffset(): UTC = local + offset. WhatsApp exports carry no timezone. */
  tzOffsetMinutes?: number;
  dateOrder?: DateOrder | "auto";
}

export interface ParseResult {
  messages: ParsedMessage[];
  participants: string[];
  dateOrder: DateOrder;
  dateOrderAmbiguous: boolean;
  unparsedTimestamps: number;
  /** Lines before the first recognised message (usually empty). */
  ignoredLeadingLines: number;
  warnings: string[];
}

const ANDROID = /^(\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4}),?\s+(\d{1,2}[:.]\d{2}(?:[:.]\d{2})?)\s?([ap]\.?m\.?)?\s+[-–—]\s+(.*)$/i;
const IOS = /^\[(\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4}),?\s+(\d{1,2}[:.]\d{2}(?:[:.]\d{2})?)\s?([ap]\.?m\.?)?\]\s+(.*)$/i;

const MEDIA_OMITTED = /^(<?\s*(media|image|video|audio|sticker|gif|document|contact card|voice message|ptt)\s+omitted\s*>?|<media omitted>)$/i;
const ATTACHED_IOS = /^<attached:\s*(.+?)>$/i;
const ATTACHED_ANDROID = /^(.+?)\s+\((?:file attached|datei angehängt|archivo adjunto|fichier joint)\)$/i;
const DELETED = /^(this message was deleted|you deleted this message|<this message was deleted>)\.?$/i;

function normalizeLine(l: string): string {
  return l.replace(/[‎‏‪-‮﻿]/g, "").replace(/[  ]/g, " ");
}

function splitDate(d: string): [number, number, number] | null {
  const parts = d.split(/[/.\-]/).map((x) => parseInt(x, 10));
  return parts.length === 3 && parts.every((n) => Number.isFinite(n)) ? ([parts[0]!, parts[1]!, parts[2]!] as [number, number, number]) : null;
}

export function detectDateOrder(dates: string[]): { order: DateOrder; ambiguous: boolean } {
  let firstOver12 = false;
  let secondOver12 = false;
  let yearFirst = false;
  for (const d of dates) {
    const p = splitDate(d);
    if (!p) continue;
    if (p[0] > 31) yearFirst = true;
    if (p[0] > 12 && p[0] <= 31) firstOver12 = true;
    if (p[1] > 12) secondOver12 = true;
  }
  if (yearFirst) return { order: "ymd", ambiguous: false };
  if (firstOver12 && !secondOver12) return { order: "dmy", ambiguous: false };
  if (secondOver12 && !firstOver12) return { order: "mdy", ambiguous: false };
  return { order: "dmy", ambiguous: !(firstOver12 && secondOver12) };
}

function buildDate(dateStr: string, timeStr: string, ampm: string | undefined, order: DateOrder, tz: number): Date | null {
  const p = splitDate(dateStr);
  if (!p) return null;
  let day: number, month: number, year: number;
  if (order === "ymd") [year, month, day] = p;
  else if (order === "mdy") [month, day, year] = p;
  else [day, month, year] = p;
  if (year < 100) year += year < 70 ? 2000 : 1900;
  const t = timeStr.split(/[:.]/).map((x) => parseInt(x, 10));
  let hour = t[0] ?? 0;
  const minute = t[1] ?? 0;
  const second = t[2] ?? 0;
  if (ampm) {
    const pm = ampm.toLowerCase().startsWith("p");
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (pm ? 12 : 0);
  }
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  const utc = Date.UTC(year, month - 1, day, hour, minute, second);
  const d = new Date(utc + tz * 60000);
  // Reject overflowed dates like 31 Feb.
  const check = new Date(utc);
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return d;
}

function classify(rest: string): { sender: string | null; text: string } {
  const idx = rest.indexOf(": ");
  if (idx > 0 && idx <= 80) {
    const sender = rest.slice(0, idx).trim();
    // System lines often contain quotes or sentence-like text before any colon.
    if (sender && !/["“”]/.test(sender) && sender.split(/\s+/).length <= 8) {
      return { sender, text: rest.slice(idx + 2) };
    }
  }
  return { sender: null, text: rest };
}

function dedupeKeyFor(parts: string[], counts: Map<string, number>): string {
  const base = parts.join("␟");
  const n = (counts.get(base) ?? 0) + 1;
  counts.set(base, n);
  return crypto.createHash("sha1").update(`${base}␟${n}`).digest("hex");
}

export function parseWhatsAppExport(raw: string, opts: ParseOptions = {}): ParseResult {
  const tz = opts.tzOffsetMinutes ?? 0;
  const lines = raw.replace(/^﻿/, "").split(/\r\n|\n|\r/);

  interface Draft { date: string; time: string; ampm?: string; rest: string; cont: string[] }
  const drafts: Draft[] = [];
  let ignored = 0;
  for (const original of lines) {
    const line = normalizeLine(original);
    const m = ANDROID.exec(line) ?? IOS.exec(line);
    if (m) {
      drafts.push({ date: m[1]!, time: m[2]!, ampm: m[3], rest: m[4]!, cont: [] });
    } else if (drafts.length > 0) {
      drafts[drafts.length - 1]!.cont.push(line);
    } else if (line.trim()) {
      ignored++;
    }
  }

  const forced = opts.dateOrder && opts.dateOrder !== "auto" ? opts.dateOrder : null;
  const detected = detectDateOrder(drafts.map((d) => d.date));
  const order = forced ?? detected.order;
  const ambiguous = !forced && detected.ambiguous;

  const counts = new Map<string, number>();
  const people = new Set<string>();
  const messages: ParsedMessage[] = [];
  let unparsed = 0;

  drafts.forEach((d, index) => {
    const when = buildDate(d.date, d.time, d.ampm, order, tz);
    if (!when) unparsed++;
    const { sender, text: first } = classify(d.rest);
    let body = [first, ...d.cont].join("\n").replace(/\s+$/g, "");
    let kind: ParsedMessage["kind"] = sender ? "text" : "system";
    let attachmentName: string | null = null;

    const flat = body.trim();
    const ios = ATTACHED_IOS.exec(flat);
    const android = !ios ? ATTACHED_ANDROID.exec(flat.split("\n")[0] ?? "") : null;
    if (ios) {
      attachmentName = ios[1]!.trim();
      kind = "media";
      body = "";
    } else if (android) {
      attachmentName = android[1]!.trim();
      kind = "media";
      body = flat.split("\n").slice(1).join("\n").trim(); // Android puts the caption on following lines
    } else if (MEDIA_OMITTED.test(flat)) {
      kind = "media";
      body = "";
    } else if (DELETED.test(flat)) {
      kind = "deleted";
      body = "";
    }
    if (sender) people.add(sender);
    messages.push({
      index,
      sender,
      sentAt: when,
      rawTimestamp: `${d.date} ${d.time}${d.ampm ? ` ${d.ampm}` : ""}`,
      body,
      kind,
      attachmentName,
      dedupeKey: dedupeKeyFor([when ? when.toISOString() : `raw:${d.date} ${d.time}`, sender ?? "", kind, body, attachmentName ?? ""], counts),
    });
  });

  const warnings: string[] = [];
  if (ambiguous) warnings.push(`Dates like ${drafts[0]?.date ?? "01/02/2024"} could be day/month or month/day. They were read as ${order === "mdy" ? "month/day/year" : "day/month/year"}; re-import with the other order if that is wrong.`);
  if (unparsed > 0) warnings.push(`${unparsed} message${unparsed === 1 ? " has" : "s have"} a timestamp that could not be read; they were kept without a date.`);
  if (ignored > 0) warnings.push(`${ignored} line${ignored === 1 ? "" : "s"} before the first message ${ignored === 1 ? "was" : "were"} ignored.`);
  warnings.push("WhatsApp exports have no time zone, so times are assumed to be in the time zone you selected.");

  return {
    messages,
    participants: [...people],
    dateOrder: order,
    dateOrderAmbiguous: ambiguous,
    unparsedTimestamps: unparsed,
    ignoredLeadingLines: ignored,
    warnings,
  };
}

/** "WhatsApp Chat with Rahul.txt" -> "Rahul"; "WhatsApp Chat - Family.txt" -> "Family". */
export function whatsappTitleFromFilename(name: string): string {
  const base = name.replace(/\.[a-z0-9]+$/i, "").replace(/^.*[\\/]/, "");
  const m = /^whatsapp chat (?:with|-|–)\s*(.+)$/i.exec(base) ?? /^chat (?:with|-)\s*(.+)$/i.exec(base);
  const t = (m?.[1] ?? base).trim();
  return t || "WhatsApp chat";
}
