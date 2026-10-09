import type { SupabaseClient } from "@supabase/supabase-js";
import { typeFromName } from "@/lib/files/types";
import type { ContentCard, Passage, SearchHit, SectionKey } from "./types";

const SOURCE_LABELS: Record<string, string> = {
  upload: "Uploaded",
  whatsapp: "WhatsApp export",
  telegram: "Telegram",
  link: "Saved link",
  note: "Note",
  ai_chat: "Chat attachment",
};
export const sourceLabel = (id: string) => SOURCE_LABELS[id] ?? id;

export const SECTION_LABELS: Record<SectionKey, string> = {
  files: "Related files",
  conversations: "Related conversations",
  links: "Related links",
  media: "Related media",
  notes: "Related notes",
};

const MIME_LABELS: [RegExp, string][] = [
  [/pdf/, "PDF"],
  [/wordprocessingml/, "Word"],
  [/spreadsheetml/, "Excel"],
  [/presentationml/, "PowerPoint"],
  [/^text\/csv/, "CSV"],
  [/json/, "JSON"],
  [/^text\/markdown/, "Markdown"],
  [/^text\/plain/, "Text"],
  [/^image\//, "Image"],
  [/^video\//, "Video"],
  [/^audio\//, "Audio"],
  [/zip|tar|gzip/, "Archive"],
];
export function mimeLabel(mime: string | null, name: string): string {
  const m = mime ?? typeFromName(name).mime;
  for (const [re, label] of MIME_LABELS) if (re.test(m)) return label;
  const ext = name.split(".").pop();
  return ext && ext !== name ? ext.toUpperCase() : "File";
}

/** A short passage centred on the first query-term match. */
export function makeSnippet(text: string, terms: string[], max = 300): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const lower = clean.toLowerCase();
  let at = -1;
  for (const t of terms) {
    const i = lower.indexOf(t.toLowerCase());
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0) return clean.slice(0, max).trimEnd() + "…";
  const start = Math.max(0, at - Math.floor(max / 3));
  const end = Math.min(clean.length, start + max);
  return (start > 0 ? "…" : "") + clean.slice(start, end).trim() + (end < clean.length ? "…" : "");
}

interface Grouped {
  key: string;
  type: ContentCard["type"];
  id: string;
  hits: SearchHit[];
  best: number;
}

function itemOf(h: SearchHit): { type: ContentCard["type"]; id: string } | null {
  if (h.file_id) return { type: "file", id: h.file_id };
  if (h.link_id) return { type: "link", id: h.link_id };
  if (h.note_id) return { type: "note", id: h.note_id };
  if (h.conversation_id) return { type: "conversation", id: h.conversation_id };
  return null;
}

/**
 * Turns raw hits into cards by loading the real rows through the USER-scoped client (so RLS is
 * enforced again at this step). Anything that no longer exists or isn't visible is dropped.
 */
export async function buildCards(
  supabase: SupabaseClient,
  hits: SearchHit[],
  terms: string[],
  opts: { maxCards?: number; senderMatched?: boolean } = {},
): Promise<ContentCard[]> {
  const groups = new Map<string, Grouped>();
  for (const h of hits) {
    const it = itemOf(h);
    if (!it) continue;
    const key = `${it.type}:${it.id}`;
    const g = groups.get(key) ?? { key, type: it.type, id: it.id, hits: [], best: 0 };
    g.hits.push(h);
    g.best = Math.max(g.best, h.score);
    groups.set(key, g);
  }
  const ordered = [...groups.values()].sort((a, b) => b.best - a.best).slice(0, opts.maxCards ?? 10);
  if (ordered.length === 0) return [];
  const topScore = ordered[0]!.best || 1;

  const ids = (t: ContentCard["type"]) => ordered.filter((g) => g.type === t).map((g) => g.id);
  const [files, links, notes, convs] = await Promise.all([
    ids("file").length ? supabase.from("files").select("*").in("id", ids("file")).is("deleted_at", null) : { data: [] },
    ids("link").length ? supabase.from("links").select("*").in("id", ids("link")) : { data: [] },
    ids("note").length ? supabase.from("notes").select("id,title,created_at,updated_at").in("id", ids("note")) : { data: [] },
    ids("conversation").length ? supabase.from("conversations").select("*").in("id", ids("conversation")) : { data: [] },
  ]);
  type Row = { id: string } & Record<string, any>;
  const byId = (rows: unknown) => new Map(((rows as Row[] | null) ?? []).map((r) => [r.id, r]));
  const F = byId(files.data);
  const L = byId(links.data);
  const N = byId(notes.data);
  const C = byId(convs.data);

  const cards: ContentCard[] = [];
  for (const g of ordered) {
    const rel = Math.min(1, g.best / topScore);
    const relevanceLabel: ContentCard["relevanceLabel"] = rel >= 0.75 ? "high" : rel >= 0.45 ? "medium" : "low";
    const passages: Passage[] = g.hits
      .filter((h) => h.body_excerpt && h.kind !== "file")
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((h) => ({
        recordId: h.record_id,
        text: makeSnippet(h.body_excerpt, terms, h.kind === "message_window" ? 420 : 300),
        page: h.page_start,
        pageEnd: h.page_end,
        seqFrom: h.seq_from,
        seqTo: h.seq_to,
        matchedBy: h.matched_by,
      }));
    const sender = g.hits.find((h) => h.senders?.length)?.senders[0] ?? null;
    const common = { key: g.key, id: g.id, relevance: rel, relevanceLabel, passages, senderVerified: false as const, sender };

    if (g.type === "file") {
      const f = F.get(g.id);
      if (!f) continue;
      const isMedia = f.category === "image" || f.category === "video";
      cards.push({
        ...common,
        type: "file",
        section: isMedia ? "media" : "files",
        title: f.display_name,
        typeLabel: mimeLabel(f.mime_type, f.display_name),
        mime: f.mime_type,
        category: f.category,
        sourceId: f.source_id,
        sourceLabel: sourceLabel(f.source_id),
        sender: f.sender_label ?? sender,
        date: f.original_date ?? f.created_at,
        dateKind: f.original_date ? (f.conversation_id ? "sent" : "modified") : "uploaded",
        sizeBytes: Number(f.size_bytes),
        status: f.status,
        statusDetail: f.status_detail,
        description: f.ai_metadata?.summary ?? f.description ?? null,
        url: null,
        conversationTitle: null,
        messageCount: null,
      });
    } else if (g.type === "link") {
      const l = L.get(g.id);
      if (!l) continue;
      cards.push({
        ...common,
        type: "link",
        section: "links",
        title: l.title ?? l.url,
        typeLabel: "Link",
        mime: null,
        category: null,
        sourceId: "link",
        sourceLabel: sourceLabel("link"),
        sender: null,
        date: l.created_at,
        dateKind: "saved",
        sizeBytes: null,
        status: l.status,
        statusDetail: l.status_detail,
        description: l.summary ?? l.description ?? null,
        url: l.final_url ?? l.url,
        conversationTitle: null,
        messageCount: null,
      });
    } else if (g.type === "note") {
      const n = N.get(g.id);
      if (!n) continue;
      cards.push({
        ...common,
        type: "note",
        section: "notes",
        title: n.title,
        typeLabel: "Note",
        mime: null,
        category: null,
        sourceId: "note",
        sourceLabel: sourceLabel("note"),
        sender: null,
        date: n.updated_at,
        dateKind: "created",
        sizeBytes: null,
        status: "ready",
        statusDetail: null,
        description: null,
        url: null,
        conversationTitle: null,
        messageCount: null,
      });
    } else {
      const c = C.get(g.id);
      if (!c) continue;
      const first = g.hits.find((h) => h.occurred_at);
      cards.push({
        ...common,
        type: "conversation",
        section: "conversations",
        title: c.title,
        typeLabel: c.source_id === "telegram" ? "Telegram chat" : "WhatsApp chat",
        mime: null,
        category: null,
        sourceId: c.source_id,
        sourceLabel: sourceLabel(c.source_id),
        sender: opts.senderMatched === false ? null : sender,
        date: first?.occurred_at ?? c.last_message_at,
        dateKind: first?.occurred_at ? "sent" : null,
        sizeBytes: null,
        status: "ready",
        statusDetail: null,
        description: null,
        url: null,
        conversationTitle: c.title,
        messageCount: c.message_count,
      });
    }
  }
  return cards;
}

export function groupSections(cards: ContentCard[]): { key: SectionKey; label: string; cardKeys: string[] }[] {
  const order: SectionKey[] = ["files", "conversations", "links", "media", "notes"];
  return order
    .map((key) => ({ key, label: SECTION_LABELS[key], cardKeys: cards.filter((c) => c.section === key).map((c) => c.key) }))
    .filter((s) => s.cardKeys.length > 0);
}

/**
 * Re-resolves stored card references into fresh cards. History stores identifiers only, so every
 * display goes back through RLS: deleted, trashed or no-longer-shared items simply disappear.
 */
export async function rehydrateCards(
  supabase: SupabaseClient,
  refs: { type: ContentCard["type"]; id: string }[],
): Promise<ContentCard[]> {
  if (refs.length === 0) return [];
  const hits = refs.map((t) => ({
    record_id: "", kind: t.type === "conversation" ? "message_window" : t.type, source_id: "",
    file_id: t.type === "file" ? t.id : null, link_id: t.type === "link" ? t.id : null,
    note_id: t.type === "note" ? t.id : null, conversation_id: t.type === "conversation" ? t.id : null,
    title: "", body_excerpt: "", page_start: null, page_end: null, seq_from: null, seq_to: null, senders: [],
    occurred_at: null, date_kind: null, file_category: null, score: 1, text_score: 0, semantic_score: 0, meta_score: 0, matched_by: [],
  })) as SearchHit[];
  const cards = await buildCards(supabase, hits, [], { maxCards: refs.length });
  const idx = (c: ContentCard) => refs.findIndex((t) => t.type === c.type && t.id === c.id);
  return cards.sort((a, b) => idx(a) - idx(b));
}
