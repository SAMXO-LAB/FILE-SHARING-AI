/**
 * Groups consecutive chat messages into searchable "windows". A single message ("ok", "send it")
 * carries no meaning on its own; a short run of neighbouring messages does, and it lets answers
 * show real conversational context.
 */
export interface WindowMessage {
  seq: number;
  sender: string | null;
  sentAt: string | null;
  body: string;
  kind: "text" | "media" | "system" | "deleted";
  attachmentName: string | null;
}

export interface MessageWindow {
  seqFrom: number;
  seqTo: number;
  body: string;
  senders: string[];
  occurredAt: string | null;
}

export interface WindowOptions {
  maxMessages?: number;
  maxChars?: number;
  gapMs?: number;
}

function stamp(iso: string | null): string {
  return iso ? iso.slice(0, 16).replace("T", " ") : "undated";
}

export function formatMessageLine(m: WindowMessage): string {
  const who = m.sender ?? "Unknown";
  const content = m.kind === "media" ? `${m.body ? `${m.body} ` : ""}[attachment${m.attachmentName ? `: ${m.attachmentName}` : ""}]` : m.body;
  return `[${stamp(m.sentAt)}] ${who}: ${content}`;
}

export function buildWindows(messages: WindowMessage[], opts: WindowOptions = {}): MessageWindow[] {
  const maxMessages = opts.maxMessages ?? 20;
  const maxChars = opts.maxChars ?? 1800;
  const gapMs = opts.gapMs ?? 6 * 3600_000;

  const usable = messages.filter((m) => (m.kind === "text" || m.kind === "media") && (m.body.trim() || m.attachmentName));
  const windows: MessageWindow[] = [];
  let cur: { lines: string[]; senders: Set<string>; from: number; to: number; first: string | null; last: string | null; chars: number } | null = null;

  const flush = () => {
    if (cur && cur.lines.length) {
      windows.push({ seqFrom: cur.from, seqTo: cur.to, body: cur.lines.join("\n"), senders: [...cur.senders], occurredAt: cur.first });
    }
    cur = null;
  };

  for (const m of usable) {
    const line = formatMessageLine(m).slice(0, 1500);
    const gap = cur && cur.last && m.sentAt ? Date.parse(m.sentAt) - Date.parse(cur.last) : 0;
    if (cur && (cur.lines.length >= maxMessages || cur.chars + line.length > maxChars || gap > gapMs)) flush();
    cur ??= { lines: [], senders: new Set(), from: m.seq, to: m.seq, first: m.sentAt, last: m.sentAt, chars: 0 };
    cur.lines.push(line);
    cur.chars += line.length + 1;
    cur.to = m.seq;
    cur.first ??= m.sentAt;
    if (m.sentAt) cur.last = m.sentAt;
    if (m.sender) cur.senders.add(m.sender);
  }
  flush();
  return windows;
}
