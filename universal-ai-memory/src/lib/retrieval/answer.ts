import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { embedTexts } from "@/lib/ai/embeddings";
import type { Policy } from "@/lib/ai/policy";
import { answerSystemPrompt, DOCUMENT_GUARD, fence, generalSystemPrompt } from "@/lib/ai/prompts";
import { AiNotConfiguredError, AiProviderError, chat, chatJson } from "@/lib/ai/provider";
import { aiConfig } from "@/lib/env";
import { buildCards, groupSections, mimeLabel, sourceLabel } from "./cards";
import { cleanLabel, describeEvidenceHeader, evidenceFromCards, loadTargetEvidence, toCitation, type Evidence } from "./evidence";
import {
  aiInterpretationSchema, interpretHeuristic, mergeAiInterpretation,
  type Interpretation, type ItemRef,
} from "./interpret";
import { searchMemory, type SearchFilters } from "./search";
import type { AskResult, CardType, Citation, ContentCard, PreviousTurn, SuggestedAction } from "./types";

export interface UserFilters {
  sourceIds?: string[];
  categories?: string[];
  from?: string | null;
  to?: string | null;
  collectionId?: string | null;
  /** Chip IDs the user removed from the understood filters ("sender", "date", "type", "source"). */
  dropped?: ("sender" | "date" | "type" | "source")[];
}

export interface AskInput {
  question: string;
  policy: Policy;
  previous?: PreviousTurn | null;
  /** Files attached to this chat turn (already uploaded by the user). */
  attachmentFileIds?: string[];
  filters?: UserFilters;
  tzOffsetMinutes?: number;
  now?: Date;
}

const llmAnswerSchema = z.object({
  answer: z.string().min(1).max(8000),
  insufficient: z.boolean().default(false),
  suggested_actions: z.array(z.string().max(120)).max(3).default([]),
});

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null;

function noAiReason(policy: Policy): string {
  if (!aiConfig()) return "Written answers are unavailable because no AI provider is configured on this server, so you're seeing matching passages instead.";
  if (policy.mode === "metadata_only") return "Your privacy mode is “Metadata only”, so file contents aren't read and no written answer is produced.";
  return "Your privacy mode doesn't send content to an AI provider, so you're seeing matching passages instead of a written answer. Switch to Cloud AI in Settings → Privacy for written answers and semantic search.";
}

// -----------------------------------------------------------------------------------------------
// Follow-up resolution ("summarise the second PDF", "compare it with the first one")
// -----------------------------------------------------------------------------------------------
function matchesNoun(card: PreviousTurn["cards"][number], noun: string | undefined): boolean {
  if (!noun) return true;
  switch (noun) {
    case "pdf": return card.mime === "application/pdf";
    case "image": case "photo": return card.category === "image";
    case "link": return card.type === "link";
    case "note": return card.type === "note";
    case "message": case "conversation": return card.type === "conversation";
    case "document": case "doc": case "paper": case "file": return card.type === "file";
    default: return true;
  }
}

export function resolveRefs(refs: ItemRef[], prev: PreviousTurn | null): { targets: PreviousTurn["cards"]; unresolved: boolean } {
  if (refs.length === 0) return { targets: [], unresolved: false };
  if (!prev || prev.cards.length === 0) return { targets: [], unresolved: true };
  const out: PreviousTurn["cards"] = [];
  const push = (c?: PreviousTurn["cards"][number]) => {
    if (c && !out.some((x) => x.type === c.type && x.id === c.id)) out.push(c);
  };
  // Pronouns refer to the current focus first; ordinals index the previous list.
  for (const r of refs) {
    if (r.kind === "pronoun") {
      if (prev.focus) push(prev.cards.find((c) => c.type === prev.focus!.type && c.id === prev.focus!.id) ?? { ...prev.focus, mime: null, category: null });
      else if (prev.cards.length === 1) push(prev.cards[0]);
    }
  }
  for (const r of refs) {
    if (r.kind !== "ordinal" || r.index === undefined) continue;
    const pool = prev.cards.filter((c) => matchesNoun(c, r.fileType));
    push(r.index === -1 ? pool[pool.length - 1] : pool[r.index]);
  }
  return { targets: out, unresolved: out.length === 0 };
}

// -----------------------------------------------------------------------------------------------
// Query understanding
// -----------------------------------------------------------------------------------------------
async function interpret(input: AskInput, prev: PreviousTurn | null): Promise<Interpretation> {
  const base = interpretHeuristic(input.question, { now: input.now, tzOffsetMinutes: input.tzOffsetMinutes });
  if (!input.policy.ai) return base;
  try {
    const now = (input.now ?? new Date()).toISOString();
    const ai = await chatJson(
      [
        {
          role: "system",
          content:
            "You convert a question about a user's personal files and chats into search parameters. " +
            `Today is ${now}. ${DOCUMENT_GUARD}\n` +
            'Return JSON: {"intent": "find|summarize|compare|explain|duplicates|recent|question", "search_terms": [topic keywords only, no filler, max 8], ' +
            '"sender": person name or null, "date_from": ISO or null, "date_to": ISO (exclusive) or null, ' +
            '"file_types": subset of [pdf, word, spreadsheet, presentation, image, video, audio, text], "sources": subset of [whatsapp, telegram, link, upload, note], ' +
            '"personal": true if the question is about the user\'s own data}. Only include a sender if a specific person is named. Never invent dates.',
        },
        {
          role: "user",
          content:
            `Question: ${input.question.slice(0, 600)}` +
            (prev?.cards.length ? `\n\nItems from the previous answer, in order:\n${fence("titles", prev.cards.map((c, i) => `${i + 1}. ${cleanLabel(c.title, 80)}`).join("\n"))}` : ""),
        },
      ],
      aiInterpretationSchema,
      // Understanding the question is a nice-to-have: keep it short so the answer has time.
      { maxTokens: 300, temperature: 0, timeoutMs: 8_000 },
    );
    return mergeAiInterpretation(base, ai);
  } catch {
    return base; // provider trouble must never block search
  }
}

function applyDropped(interp: Interpretation, dropped: UserFilters["dropped"]): Interpretation {
  if (!dropped?.length) return interp;
  const out = { ...interp, chips: interp.chips.filter((c) => !dropped.includes(c.kind)) };
  if (dropped.includes("sender")) out.sender = null;
  if (dropped.includes("date")) out.dateRange = null;
  if (dropped.includes("type")) { out.mimeTypes = null; out.fileCategories = null; }
  if (dropped.includes("source")) out.sources = null;
  return out;
}

// -----------------------------------------------------------------------------------------------
// Duplicates (hash-based; never guessed by the model)
// -----------------------------------------------------------------------------------------------
async function duplicateCards(supabase: SupabaseClient): Promise<{ cards: ContentCard[]; groups: number; unhashed: number }> {
  const { data } = await supabase.from("files").select("id,content_hash,created_at").is("deleted_at", null).not("content_hash", "is", null).limit(5000);
  const byHash = new Map<string, string[]>();
  for (const f of (data ?? []) as { id: string; content_hash: string }[]) byHash.set(f.content_hash, [...(byHash.get(f.content_hash) ?? []), f.id]);
  const dupIds = [...byHash.values()].filter((v) => v.length > 1);
  const { count: unhashed } = await supabase.from("files").select("id", { count: "exact", head: true }).is("deleted_at", null).is("content_hash", null);
  if (dupIds.length === 0) return { cards: [], groups: 0, unhashed: unhashed ?? 0 };

  const ids = dupIds.flat().slice(0, 60);
  const { data: files } = await supabase.from("files").select("*").in("id", ids);
  const byId = new Map((files ?? []).map((f: any) => [f.id as string, f]));
  const cards: ContentCard[] = [];
  dupIds.forEach((group, gi) => {
    for (const id of group) {
      const f = byId.get(id) as any;
      if (!f) continue;
      cards.push({
        key: `file:${f.id}`, type: "file", id: f.id, section: "files", title: f.display_name, typeLabel: mimeLabel(f.mime_type, f.display_name),
        mime: f.mime_type, category: f.category, sourceId: f.source_id, sourceLabel: sourceLabel(f.source_id), sender: f.sender_label, senderVerified: false,
        date: f.original_date ?? f.created_at, dateKind: f.original_date ? "modified" : "uploaded", sizeBytes: Number(f.size_bytes), status: f.status, statusDetail: f.status_detail,
        description: `Duplicate set ${gi + 1}: ${group.length} identical files.`, url: null, conversationTitle: null, messageCount: null,
        relevance: 1, relevanceLabel: "high", passages: [],
      });
    }
  });
  return { cards, groups: dupIds.length, unhashed: unhashed ?? 0 };
}

// -----------------------------------------------------------------------------------------------
// Suggested actions: deterministic, based on what was actually found
// -----------------------------------------------------------------------------------------------
function suggestActions(cards: ContentCard[], policy: Policy): SuggestedAction[] {
  if (cards.length === 0) return [];
  const out: SuggestedAction[] = [];
  const files = cards.filter((c) => c.type === "file");
  const noun = files.length ? "document" : cards[0]!.type === "conversation" ? "conversation" : cards[0]!.type;
  if (policy.ai) {
    out.push({ id: "summarize", label: `Summarize the first ${noun}`, kind: "prompt", prompt: `Summarize the first ${noun}` });
    if (files.length >= 2) out.push({ id: "compare", label: "Compare the first two", kind: "prompt", prompt: "Compare the first document with the second one" });
    out.push({ id: "study", label: "Generate a study guide", kind: "prompt", prompt: "Generate a study guide from these results" });
  }
  out.push({ id: "collection", label: "Create a collection", kind: "collection" });
  out.push({ id: "similar", label: "Find similar material", kind: "prompt", prompt: `Find material similar to “${cards[0]!.title}”` });
  return out.slice(0, 5);
}

function cardRefs(cards: ContentCard[]) {
  return cards.map((c) => ({ type: c.type as CardType, id: c.id, title: c.title, mime: c.mime, category: c.category }));
}

// -----------------------------------------------------------------------------------------------
// Answer composition
// -----------------------------------------------------------------------------------------------
function extractiveAnswer(cards: ContentCard[], evidence: Evidence[], interp: Interpretation, relaxed: string[]): { text: string; citations: Citation[] } {
  const topic = interp.terms.length ? ` about “${interp.terms.slice(0, 4).join(" ")}”` : "";
  const lines: string[] = [`I found ${cards.length} item${cards.length === 1 ? "" : "s"} in your memory${topic}.`];
  const citations: Citation[] = [];
  const seen = new Set<string>();
  for (const e of evidence) {
    if (seen.has(e.cardKey) || citations.length >= 3) continue;
    seen.add(e.cardKey);
    const card = cards.find((c) => c.key === e.cardKey)!;
    const n = citations.length + 1;
    const when = fmtDate(card.date);
    const where = e.page ? `, page ${e.page}` : "";
    const quote = e.generated || e.text.startsWith("(") ? "" : ` — “${e.text.slice(0, 160).trim()}${e.text.length > 160 ? "…" : ""}”`;
    lines.push(`${n === 1 ? "Best match" : "Also"}: “${card.title}” (${card.typeLabel}${when ? `, ${when}` : ""}${where})${quote} [${n}]`);
    citations.push(toCitation(e, n));
  }
  if (relaxed.length) lines.push(...relaxed);
  return { text: lines.join("\n\n"), citations };
}

/** Maps [E#] markers to 1..k in order of first use and drops markers that don't correspond to evidence. */
export function resolveCitationMarkers(answer: string, evidence: Evidence[]): { text: string; citations: Citation[] } {
  const order = new Map<number, number>();
  const citations: Citation[] = [];
  const text = answer
    .replace(/\[E(\d+)\]/g, (_m, d: string) => {
      const e = evidence.find((x) => x.n === Number(d));
      if (!e) return "";
      if (!order.has(e.n)) {
        order.set(e.n, order.size + 1);
        citations.push(toCitation(e, order.size));
      }
      return `[${order.get(e.n)}]`;
    })
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
  return { text, citations };
}

function taskHint(q: string): string {
  const t = q.toLowerCase();
  if (/study guide/.test(t)) return "Write a study guide: key concepts with short definitions, how they connect, and 5 review questions. Use only the evidence.";
  if (/compare|difference/.test(t)) return "Compare the items: similarities, differences, and what each uniquely covers. Cite each claim.";
  if (/summari[sz]e|overview|tl;?dr/.test(t)) return "Summarise the key points clearly and cite sources.";
  if (/simple|explain|eli5/.test(t)) return "Explain in plain, simple language, then list the main points.";
  return "Answer the question using the evidence.";
}

async function llmAnswer(question: string, evidence: Evidence[], policy: Policy): Promise<{ text: string; citations: Citation[]; insufficient: boolean; actions: string[] } | null> {
  const evidenceText = evidence
    .map((e) => `[E${e.n}] ${describeEvidenceHeader(e)}\n${fence("passage", e.text)}`)
    .join("\n\n");
  const out = await chatJson(
    [
      { role: "system", content: answerSystemPrompt(policy.responseStyle) },
      { role: "user", content: `QUESTION: ${question.slice(0, 800)}\nTASK: ${taskHint(question)}\n\nEVIDENCE:\n${evidenceText}` },
    ],
    llmAnswerSchema,
    { maxTokens: 1400, temperature: 0.2 },
  );
  if (!out) return null;
  const resolved = resolveCitationMarkers(out.answer, evidence);
  return { text: resolved.text, citations: resolved.citations, insufficient: out.insufficient, actions: out.suggested_actions };
}

// -----------------------------------------------------------------------------------------------
// Main entry
// -----------------------------------------------------------------------------------------------
export async function ask(supabase: SupabaseClient, input: AskInput): Promise<AskResult> {
  const { policy } = input;
  const prev = input.previous ?? null;
  const limitations: string[] = [];
  const empty = (answer: string, mode: AskResult["mode"], interp: Interpretation, extra: Partial<AskResult> = {}): AskResult => ({
    answer, mode, citations: [], cards: [], sections: [], suggestedActions: [], limitations, interpretation: { chips: interp.chips, intent: interp.intent },
    focus: null, searchedTerms: interp.terms, semantic: false, ...extra,
  });

  let interp = applyDropped(await interpret(input, prev), input.filters?.dropped);
  const heavy = interp.intent === "summarize" || interp.intent === "compare" || interp.intent === "explain";

  // ---- Duplicates ------------------------------------------------------------------------------
  if (interp.intent === "duplicates") {
    const d = await duplicateCards(supabase);
    if (d.unhashed > 0) limitations.push(`${d.unhashed} file${d.unhashed === 1 ? " hasn't" : "s haven't"} been fingerprinted yet (still processing), so duplicates among them can't be detected.`);
    if (d.groups === 0) return empty("I didn't find any identical files among the files that have finished processing.", "none", interp);
    const res = empty(`I found ${d.groups} set${d.groups === 1 ? "" : "s"} of identical files (${d.cards.length} files). Files are compared by a content fingerprint, so renamed copies are caught and look-alikes aren't.`, "extractive", interp, {
      cards: d.cards, sections: groupSections(d.cards), semantic: false,
    });
    res.suggestedActions = [];
    return res;
  }

  // ---- Follow-ups and attachments: work on specific, already-identified items -------------------
  const attachmentTargets: PreviousTurn["cards"] = (input.attachmentFileIds ?? []).map((id) => ({ type: "file" as const, id, title: "", mime: null, category: null }));
  const { targets: refTargets, unresolved } = resolveRefs(interp.refs, prev);
  let targets = attachmentTargets.length ? attachmentTargets : refTargets;
  if (interp.intent === "compare" && targets.length < 2 && prev && prev.cards.length >= 2 && interp.refs.length === 0) targets = prev.cards.slice(0, 2);

  if (!attachmentTargets.length && interp.refs.length && unresolved) {
    return empty(
      "I'm not sure which item you mean. Ask me to find something first (or attach a file), then refer to it as “the first one”, “the second PDF”, or “it”.",
      "clarify", interp,
    );
  }
  if (interp.intent === "compare" && targets.length < 2 && (interp.refs.length > 0 || attachmentTargets.length > 0)) {
    return empty("Comparing needs two documents. Tell me which two (for example “compare the first and second PDF”), or attach both.", "clarify", interp);
  }

  if (targets.length > 0) {
    // Files attached to the chat must be fully processed before they can be read.
    if (attachmentTargets.length) {
      const { data: rows } = await supabase.from("files").select("id,display_name,status,status_detail").in("id", attachmentTargets.map((t) => t.id));
      const missing = attachmentTargets.length - (rows?.length ?? 0);
      if (missing > 0) return empty("One of the attached files couldn't be found. Try attaching it again.", "clarify", interp);
      const pending = (rows ?? []).filter((r: any) => !["ready"].includes(r.status));
      if (pending.length) {
        const bad = pending.find((r: any) => r.status === "failed" || r.status === "unsupported");
        if (bad) return empty(`I can't read “${(bad as any).display_name}”: ${(bad as any).status_detail ?? "processing failed"}.`, "clarify", interp);
        return empty(`“${(pending[0] as any).display_name}” is still being processed. Give it a moment and ask again.`, "clarify", interp);
      }
    }
    return answerAboutTargets(supabase, input, interp, targets.slice(0, 4), limitations);
  }

  if (interp.intent === "compare") {
    return empty("Comparing needs two documents. Ask me to find them first, or attach both files.", "clarify", interp);
  }

  // ---- Retrieval --------------------------------------------------------------------------------
  const f = input.filters ?? {};
  const base: SearchFilters = {
    terms: interp.terms,
    kinds: null,
    sourceIds: f.sourceIds?.length ? f.sourceIds : interp.sources,
    categories: f.categories?.length ? f.categories : interp.fileCategories,
    mimeTypes: interp.mimeTypes,
    from: f.from ?? interp.dateRange?.from ?? null,
    to: f.to ?? interp.dateRange?.to ?? null,
    collectionId: f.collectionId ?? null,
    recencyBoost: policy.recencyBoost,
    limit: 60,
  };

  let semantic = false;
  if (policy.embed && interp.terms.length > 0) {
    try {
      const [vec] = await embedTexts([input.question]);
      base.embedding = vec;
      semantic = true;
    } catch (e) {
      limitations.push(`Semantic search was unavailable for this question (${e instanceof Error ? e.message.split("(")[0]!.trim() : "provider error"}); used keyword search only.`);
    }
  }

  let hits = await searchMemory(supabase, { ...base, sender: interp.sender });
  let senderMatched: boolean | undefined = interp.sender ? true : undefined;

  if (hits.length === 0 && interp.sender) {
    const relaxed = await searchMemory(supabase, { ...base, sender: null });
    if (relaxed.length) {
      hits = relaxed;
      senderMatched = false;
      limitations.push(
        `Nothing in your memory is attributed to “${interp.sender}”. Sender names exist only for imported chats, and only as labels copied from the export, so I can't verify who sent anything. These results match your topic but are NOT confirmed to be from ${interp.sender}.`,
      );
    }
  }
  if (hits.length === 0 && base.from) {
    const relaxed = await searchMemory(supabase, { ...base, from: null, to: null, sender: senderMatched === false ? null : interp.sender });
    if (relaxed.length) {
      hits = relaxed;
      limitations.push(`Nothing matched ${interp.dateRange?.label ?? "that date range"}, so these results are from other dates.`);
    }
  }
  if (!interp.terms.length && !interp.sender && !interp.dateRange && !interp.mimeTypes && !interp.fileCategories && !interp.sources && interp.intent !== "recent") {
    // Nothing to search on (e.g. "hi"): treat as a general conversation, never as a memory hit.
    hits = [];
  }

  const cards = await buildCards(supabase, hits, interp.terms, { maxCards: heavy ? 8 : 10, senderMatched });

  // ---- Nothing found ---------------------------------------------------------------------------
  if (cards.length === 0) {
    if (!interp.personal && policy.ai) {
      try {
        const text = await chat(
          [
            { role: "system", content: generalSystemPrompt(policy.responseStyle) },
            { role: "user", content: input.question.slice(0, 1500) },
          ],
          { maxTokens: 900, temperature: 0.3 },
        );
        limitations.push("Nothing relevant was found in your memory, so this answer comes from general knowledge, not from your files.");
        return empty(text.trim(), "general", interp, { semantic, searchedTerms: interp.terms });
      } catch (e) {
        if (!(e instanceof AiProviderError || e instanceof AiNotConfiguredError)) throw e;
      }
    }
    return empty(await noResultsMessage(supabase, interp, policy), "none", interp, { semantic, searchedTerms: interp.terms });
  }

  // ---- Compose the answer ----------------------------------------------------------------------
  const evidence = evidenceFromCards(cards, heavy ? 12000 : 6500, heavy ? 3 : 2);
  let answerText: string;
  let citations: Citation[];
  let mode: AskResult["mode"] = "extractive";
  let aiActions: string[] = [];

  if (policy.ai) {
    try {
      const out = await llmAnswer(input.question, evidence, policy);
      if (out) {
        answerText = out.text;
        citations = out.citations;
        mode = "ai";
        aiActions = out.actions;
        if (citations.length === 0 && !out.insufficient) limitations.push("This answer doesn't cite a specific passage. Check the related items below before relying on it.");
      } else {
        const ex = extractiveAnswer(cards, evidence, interp, []);
        answerText = ex.text;
        citations = ex.citations;
        limitations.push("The AI response couldn't be validated, so this is a list of matching passages instead of a written answer.");
      }
    } catch (e) {
      if (!(e instanceof AiProviderError || e instanceof AiNotConfiguredError)) throw e;
      const ex = extractiveAnswer(cards, evidence, interp, []);
      answerText = ex.text;
      citations = ex.citations;
      limitations.push(`${e.message} Showing matching passages instead.`);
    }
  } else {
    const ex = extractiveAnswer(cards, evidence, interp, []);
    answerText = ex.text;
    citations = ex.citations;
    if (interp.intent !== "recent") limitations.push(noAiReason(policy));
  }

  if (interp.sender && senderMatched === false) {
    for (const c of cards) c.sender = null; // never display an unconfirmed attribution
  }

  const actions = suggestActions(cards, policy);
  void aiActions; // model-written follow-ups are not shown: actions come from what was actually found
  return {
    answer: answerText,
    mode,
    citations,
    cards,
    sections: groupSections(cards),
    suggestedActions: actions,
    limitations,
    interpretation: { chips: interp.chips, intent: interp.intent },
    focus: heavy && cards.length === 1 ? { type: cards[0]!.type, id: cards[0]!.id, title: cards[0]!.title } : null,
    searchedTerms: interp.terms,
    semantic,
  };
}

async function noResultsMessage(supabase: SupabaseClient, interp: Interpretation, policy: Policy): Promise<string> {
  const [{ count: files }, { count: pending }] = await Promise.all([
    supabase.from("files").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("files").select("id", { count: "exact", head: true }).is("deleted_at", null).in("status", ["uploading", "uploaded", "queued", "processing"]),
  ]);
  const { count: records } = await supabase.from("memory_records").select("id", { count: "exact", head: true });
  if (!records && !files) {
    return "Your memory is empty so far. Add files, save a link, or import a chat (+ Add to Memory), and I'll be able to answer from them.";
  }
  const what = interp.terms.length ? `“${interp.terms.slice(0, 5).join(" ")}”` : "that";
  const parts = [`I couldn't find anything in your connected sources about ${what}.`];
  if (interp.sender) parts.push(`I also have no items attributed to “${interp.sender}”.`);
  if (pending) parts.push(`${pending} file${pending === 1 ? " is" : "s are"} still processing and can't be searched yet.`);
  if (policy.mode === "metadata_only") parts.push("Your privacy mode is “Metadata only”, so I can only search names and dates, not file contents.");
  parts.push("Try different words, remove a filter, or check Uploads for files that failed to process.");
  return parts.join(" ");
}

async function answerAboutTargets(
  supabase: SupabaseClient,
  input: AskInput,
  interp: Interpretation,
  targets: PreviousTurn["cards"],
  limitations: string[],
): Promise<AskResult> {
  const { policy } = input;
  // Rebuild cards for the targets from real rows (through RLS).
  const hits = targets.map((t) => ({
    record_id: "", kind: t.type === "conversation" ? "message_window" : "file", source_id: "", file_id: t.type === "file" ? t.id : null, link_id: t.type === "link" ? t.id : null,
    note_id: t.type === "note" ? t.id : null, conversation_id: t.type === "conversation" ? t.id : null, title: "", body_excerpt: "", page_start: null, page_end: null,
    seq_from: null, seq_to: null, senders: [], occurred_at: null, date_kind: null, file_category: null, score: 1, text_score: 0, semantic_score: 0, meta_score: 0, matched_by: [],
  })) as import("./types").SearchHit[];
  const cards = await buildCards(supabase, hits, [], { maxCards: 4 });
  // Keep the user's order.
  cards.sort((a, b) => targets.findIndex((t) => t.type === a.type && t.id === a.id) - targets.findIndex((t) => t.type === b.type && t.id === b.id));

  if (cards.length === 0) {
    return {
      answer: "I can't find that item any more. It may have been deleted or moved to the trash.", mode: "clarify", citations: [], cards: [], sections: [], suggestedActions: [],
      limitations, interpretation: { chips: interp.chips, intent: interp.intent }, focus: null, searchedTerms: [], semantic: false,
    };
  }

  const budget = interp.intent === "compare" ? 14000 : 12000;
  const { evidence, notes } = await loadTargetEvidence(supabase, cards.map((c) => ({ type: c.type, id: c.id })), cards, budget);
  limitations.push(...notes);

  const focus = cards.length === 1 ? { type: cards[0]!.type, id: cards[0]!.id, title: cards[0]!.title } : null;
  const finish = (answer: string, mode: AskResult["mode"], citations: Citation[]): AskResult => ({
    answer, mode, citations, cards, sections: groupSections(cards), suggestedActions: suggestActions(cards, policy), limitations,
    interpretation: { chips: interp.chips, intent: interp.intent }, focus, searchedTerms: [], semantic: false,
  });

  if (!policy.ai) {
    limitations.push(noAiReason(policy));
    const first = evidence.slice(0, 3);
    const lines = [`Here ${first.length === 1 ? "is the opening passage" : "are the opening passages"} from ${cards.map((c) => `“${c.title}”`).join(" and ")}. I can't write a summary without AI processing.`];
    const cites = first.map((e, i) => toCitation(e, i + 1));
    first.forEach((e, i) => lines.push(`“${e.text.slice(0, 220).trim()}${e.text.length > 220 ? "…" : ""}” [${i + 1}]`));
    return finish(lines.join("\n\n"), "extractive", cites);
  }

  try {
    const out = await llmAnswer(input.question, evidence, policy);
    if (out) {
      if (out.citations.length === 0 && !out.insufficient) limitations.push("This answer doesn't cite a specific passage. Check the source documents before relying on it.");
      return finish(out.text, "ai", out.citations);
    }
    limitations.push("The AI response couldn't be validated, so I'm showing the opening passages instead.");
  } catch (e) {
    if (!(e instanceof AiProviderError || e instanceof AiNotConfiguredError)) throw e;
    limitations.push(`${e.message} Showing the opening passages instead.`);
  }
  const first = evidence.slice(0, 3);
  return finish(
    first.map((e, i) => `“${e.text.slice(0, 220).trim()}${e.text.length > 220 ? "…" : ""}” [${i + 1}]`).join("\n\n") || "No readable text was found.",
    "extractive",
    first.map((e, i) => toCitation(e, i + 1)),
  );
}


/** Summarise / answer a question about specific, already-chosen items (e.g. a collection). */
export async function askAboutItems(
  supabase: SupabaseClient,
  input: { question: string; policy: Policy; items: { type: CardType; id: string }[]; tzOffsetMinutes?: number },
): Promise<AskResult> {
  const interp = interpretHeuristic(input.question, { tzOffsetMinutes: input.tzOffsetMinutes });
  const targets = input.items.slice(0, 4).map((i) => ({ type: i.type, id: i.id, title: "", mime: null, category: null }));
  return answerAboutTargets(supabase, { question: input.question, policy: input.policy }, interp, targets, []);
}
