import type { Interpretation } from "./interpret";

export type CardType = "file" | "link" | "note" | "conversation";
export type SectionKey = "files" | "media" | "conversations" | "links" | "notes";

export interface SearchHit {
  record_id: string;
  kind: "file" | "chunk" | "message_window" | "link" | "note";
  source_id: string;
  file_id: string | null;
  link_id: string | null;
  note_id: string | null;
  conversation_id: string | null;
  title: string;
  body_excerpt: string;
  page_start: number | null;
  page_end: number | null;
  seq_from: number | null;
  seq_to: number | null;
  senders: string[];
  occurred_at: string | null;
  date_kind: string | null;
  file_category: string | null;
  score: number;
  text_score: number;
  semantic_score: number;
  meta_score: number;
  matched_by: string[];
}

export interface Passage {
  recordId: string;
  text: string;
  page: number | null;
  pageEnd: number | null;
  seqFrom: number | null;
  seqTo: number | null;
  matchedBy: string[];
}

/** A real record from the user's memory, shown in the UI. Built by the backend, never by the model. */
export interface ContentCard {
  key: string; // `${type}:${id}`
  type: CardType;
  id: string;
  section: SectionKey;
  title: string;
  /** Mime type or category label, e.g. "PDF", "Image", "WhatsApp chat". */
  typeLabel: string;
  mime: string | null;
  category: string | null;
  sourceId: string;
  sourceLabel: string;
  /** Imported sender label. Unverified: comes from the export, not from an authenticated account. */
  sender: string | null;
  senderVerified: false;
  date: string | null;
  dateKind: string | null;
  sizeBytes: number | null;
  status: string | null;
  statusDetail: string | null;
  description: string | null;
  url: string | null; // links only
  conversationTitle: string | null;
  messageCount: number | null;
  relevance: number; // 0..1 relative to the best hit
  relevanceLabel: "high" | "medium" | "low";
  passages: Passage[];
}

export interface Citation {
  n: number;
  cardKey: string;
  recordId: string;
  kind: SearchHit["kind"];
  title: string;
  sourceLabel: string;
  page: number | null;
  pageEnd: number | null;
  seqFrom: number | null;
  seqTo: number | null;
  conversationTitle: string | null;
  timestamp: string | null;
  passage: string;
  /** In-app link only. We never fabricate deep links into WhatsApp/Telegram. */
  href: string;
}

export interface SuggestedAction {
  id: string;
  label: string;
  kind: "prompt" | "collection";
  prompt?: string;
}

export type AnswerMode = "ai" | "extractive" | "general" | "none" | "clarify";

export interface AskResult {
  answer: string;
  mode: AnswerMode;
  citations: Citation[];
  cards: ContentCard[];
  sections: { key: SectionKey; label: string; cardKeys: string[] }[];
  suggestedActions: SuggestedAction[];
  /** Honest notes about what could not be done (filters relaxed, semantic search off, ...). */
  limitations: string[];
  interpretation: Pick<Interpretation, "chips" | "intent">;
  /** The item the conversation is currently "about" (for follow-ups like "compare it with…"). */
  focus: { type: CardType; id: string; title: string } | null;
  searchedTerms: string[];
  /** Whether semantic (embedding) retrieval contributed. False = keyword/metadata search only. */
  semantic: boolean;
}

export interface PreviousTurn {
  /** Cards shown in the previous assistant message, in display order. */
  cards: { type: CardType; id: string; title: string; mime: string | null; category: string | null }[];
  focus: { type: CardType; id: string; title: string } | null;
}
