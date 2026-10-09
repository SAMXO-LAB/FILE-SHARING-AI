import type { SupabaseClient } from "@supabase/supabase-js";
import type { Citation, ContentCard, PreviousTurn } from "./types";
import { makeSnippet } from "./cards";

export interface Evidence {
  n: number;
  recordId: string | null;
  cardKey: string;
  kind: Citation["kind"];
  title: string;
  sourceLabel: string;
  page: number | null;
  pageEnd: number | null;
  seqFrom: number | null;
  seqTo: number | null;
  conversationTitle: string | null;
  timestamp: string | null;
  text: string;
  /** True when the text is an AI-generated summary rather than the user's own words. */
  generated?: boolean;
}

export const cleanLabel = (s: string, max = 120) => s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** Selects evidence passages from cards, spreading the character budget across the best cards. */
export function evidenceFromCards(cards: ContentCard[], budgetChars: number, perCard = 2): Evidence[] {
  const out: Evidence[] = [];
  let used = 0;
  const queue = cards.map((c) => ({ c, i: 0 }));
  let progressed = true;
  while (progressed && used < budgetChars) {
    progressed = false;
    for (const q of queue) {
      const limit = q.c.passages.length === 0 ? 1 : Math.min(perCard, q.c.passages.length);
      if (q.i >= limit || used >= budgetChars) continue;
      const p = q.c.passages[q.i];
      q.i++;
      let text: string;
      let generated = false;
      let recordId: string | null = null;
      let page: number | null = null;
      let pageEnd: number | null = null;
      let seqFrom: number | null = null;
      let seqTo: number | null = null;
      if (p) {
        text = p.text;
        recordId = p.recordId;
        page = p.page;
        pageEnd = p.pageEnd;
        seqFrom = p.seqFrom;
        seqTo = p.seqTo;
      } else if (q.c.description) {
        text = q.c.description;
        generated = q.c.type === "file" || q.c.type === "link";
      } else {
        text = "(No text from this item was indexed; it matched by name or metadata only.)";
      }
      out.push({
        n: out.length + 1,
        recordId,
        cardKey: q.c.key,
        kind: q.c.type === "conversation" ? "message_window" : q.c.type === "file" ? "chunk" : q.c.type === "link" ? "link" : "note",
        title: q.c.title,
        sourceLabel: q.c.sourceLabel,
        page,
        pageEnd,
        seqFrom,
        seqTo,
        conversationTitle: q.c.conversationTitle,
        timestamp: q.c.dateKind === "sent" ? q.c.date : null,
        text,
        generated,
      });
      used += text.length;
      progressed = true;
    }
  }
  return out;
}

export function describeEvidenceHeader(e: Evidence): string {
  const parts = [`${e.kind === "message_window" ? "Imported chat" : e.kind === "link" ? "Saved link" : e.kind === "note" ? "Note" : "File"} “${cleanLabel(e.title)}”`];
  parts.push(`source: ${cleanLabel(e.sourceLabel, 40)}`);
  if (e.page) parts.push(e.pageEnd && e.pageEnd !== e.page ? `pages ${e.page}-${e.pageEnd}` : `page ${e.page}`);
  if (e.timestamp) parts.push(`date: ${e.timestamp.slice(0, 10)}`);
  if (e.generated) parts.push("AI-generated summary, not original text");
  return parts.join(", ");
}

interface Target {
  type: "file" | "link" | "note" | "conversation";
  id: string;
}

/**
 * Loads passages for specific items (follow-ups such as "summarise the second PDF", or files attached
 * to the chat). Always goes through the user-scoped client, so access control applies again here.
 */
export async function loadTargetEvidence(
  supabase: SupabaseClient,
  targets: Target[],
  cards: ContentCard[],
  budgetChars: number,
): Promise<{ evidence: Evidence[]; notes: string[] }> {
  const evidence: Evidence[] = [];
  const notes: string[] = [];
  const perTarget = Math.max(2500, Math.floor(budgetChars / Math.max(targets.length, 1)));

  for (const t of targets) {
    const card = cards.find((c) => c.type === t.type && c.id === t.id);
    if (!card) continue;
    let rows: { id: string; chunk_index: number | null; page_start: number | null; page_end: number | null; seq_from: number | null; seq_to: number | null; body: string; occurred_at: string | null }[] = [];

    if (t.type === "note") {
      const { data } = await supabase.from("notes").select("id,body").eq("id", t.id).maybeSingle();
      if (data?.body) rows = [{ id: data.id as string, chunk_index: 0, page_start: null, page_end: null, seq_from: null, seq_to: null, body: String(data.body).slice(0, perTarget), occurred_at: null }];
    } else {
      const col = t.type === "file" ? "file_id" : t.type === "link" ? "link_id" : "conversation_id";
      const kinds = t.type === "conversation" ? ["message_window"] : ["chunk"];
      const { data } = await supabase
        .from("memory_records")
        .select("id,chunk_index,page_start,page_end,seq_from,seq_to,body,occurred_at")
        .eq(col, t.id)
        .in("kind", kinds)
        .neq("body", "")
        .order(t.type === "conversation" ? "seq_from" : "chunk_index", { ascending: true })
        .limit(600);
      rows = (data ?? []) as typeof rows;
    }

    if (rows.length === 0) {
      evidence.push({
        n: evidence.length + 1, recordId: null, cardKey: card.key, kind: t.type === "conversation" ? "message_window" : t.type === "file" ? "chunk" : t.type,
        title: card.title, sourceLabel: card.sourceLabel, page: null, pageEnd: null, seqFrom: null, seqTo: null, conversationTitle: card.conversationTitle, timestamp: null,
        text: card.description ?? "(No readable text was indexed for this item.)", generated: Boolean(card.description),
      });
      notes.push(`“${card.title}” has no extracted text${card.statusDetail ? ` (${card.statusDetail})` : ""}, so there is little to work from.`);
      continue;
    }

    // Spread the budget evenly across the whole item so a long document is covered start to end.
    let chosen = rows;
    let total = rows.reduce((n, r) => n + r.body.length, 0);
    if (total > perTarget) {
      const step = total / perTarget;
      const keep = Math.max(1, Math.floor(rows.length / step));
      chosen = Array.from({ length: keep }, (_, i) => rows[Math.min(rows.length - 1, Math.floor((i * rows.length) / keep))]!);
      total = chosen.reduce((n, r) => n + r.body.length, 0);
      const first = chosen[0]!, last = chosen[chosen.length - 1]!;
      notes.push(
        `“${card.title}” is long, so I worked from a sample of passages${first.page_start && last.page_end ? ` spanning pages ${first.page_start}–${last.page_end}` : ""} rather than every word.`,
      );
    }
    for (const r of chosen) {
      evidence.push({
        n: evidence.length + 1, recordId: r.id, cardKey: card.key,
        kind: t.type === "conversation" ? "message_window" : t.type === "file" ? "chunk" : t.type,
        title: card.title, sourceLabel: card.sourceLabel, page: r.page_start, pageEnd: r.page_end, seqFrom: r.seq_from, seqTo: r.seq_to,
        conversationTitle: card.conversationTitle, timestamp: card.dateKind === "sent" ? r.occurred_at : null, text: r.body,
      });
    }
  }
  return { evidence, notes };
}

export function toCitation(e: Evidence, n: number): Citation {
  const href =
    e.cardKey.startsWith("file:") ? `/files?open=${e.cardKey.slice(5)}${e.page ? `&page=${e.page}` : ""}` :
    e.cardKey.startsWith("conversation:") ? `/conversations/${e.cardKey.slice(13)}${e.seqFrom ? `?seq=${e.seqFrom}` : ""}` :
    e.cardKey.startsWith("link:") ? `/links?open=${e.cardKey.slice(5)}` :
    `/memory?note=${e.cardKey.slice(5)}`;
  return {
    n,
    cardKey: e.cardKey,
    recordId: e.recordId ?? "",
    kind: e.kind,
    title: e.title,
    sourceLabel: e.sourceLabel,
    page: e.page,
    pageEnd: e.pageEnd,
    seqFrom: e.seqFrom,
    seqTo: e.seqTo,
    conversationTitle: e.conversationTitle,
    timestamp: e.timestamp,
    passage: makeSnippet(e.text, [], 260),
    href,
  };
}

export function previousTurnFrom(structured: unknown): PreviousTurn | null {
  const s = structured as { cardRefs?: PreviousTurn["cards"]; focus?: PreviousTurn["focus"] } | null;
  if (!s || !Array.isArray(s.cardRefs)) return null;
  return { cards: s.cardRefs, focus: s.focus ?? null };
}
