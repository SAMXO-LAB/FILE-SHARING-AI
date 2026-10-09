/**
 * Privacy modes decide what the server is allowed to do with a user's content.
 *
 *  metadata_only  Index file names and metadata only. Content is never read.
 *  extraction     Server extracts text for keyword search. Nothing is sent to an AI provider.
 *  local          Content may go to a SELF-HOSTED AI endpoint (AI_PROVIDER_LOCALITY=local).
 *  cloud_ai       Content (retrieved passages, documents being summarised, query text) may be
 *                 sent to the configured AI provider. That provider can read it in plaintext.
 *
 * Nothing in this product is end-to-end encrypted. Files are encrypted at rest by the storage
 * provider; the server (and, in cloud_ai mode, the AI provider) can read plaintext.
 */
export type ProcessingMode = "metadata_only" | "extraction" | "local" | "cloud_ai";
export type Locality = "cloud" | "local";

export const PROCESSING_MODES: { id: ProcessingMode; label: string; summary: string; detail: string }[] = [
  {
    id: "metadata_only",
    label: "Metadata only",
    summary: "Only file names, types and dates are indexed.",
    detail: "The contents of your files are never opened. You can still find files by name, type, date and tags. AI answers and content search are unavailable.",
  },
  {
    id: "extraction",
    label: "Text extraction (private)",
    summary: "Text is extracted on our server for keyword search. Nothing goes to an AI provider.",
    detail: "Documents are opened on the server so you can search inside them. No content is sent to a third-party AI service, so answers are lists of matching passages rather than written explanations.",
  },
  {
    id: "local",
    label: "Local AI",
    summary: "AI runs on a self-hosted model that your administrator controls.",
    detail: "Content is sent to an AI endpoint that your administrator has declared to be self-hosted. Available only when the server is configured with a local provider.",
  },
  {
    id: "cloud_ai",
    label: "Cloud AI (full features)",
    summary: "Passages and documents may be sent to the AI provider to write answers and build semantic search.",
    detail: "Enables written answers, summaries, semantic search and automatic tagging. The AI provider receives the text it needs (retrieved passages, document excerpts, your question) in plaintext and handles it under its own terms.",
  },
];

/** May text content be sent to an AI endpoint with this locality under this mode? */
export function mayUseAi(mode: ProcessingMode, locality: Locality | null): boolean {
  if (!locality) return false;
  if (mode === "cloud_ai") return true; // cloud_ai also permits a local endpoint
  if (mode === "local") return locality === "local";
  return false;
}

/** May extracted text be read at all (for FTS)? */
export function mayExtractText(mode: ProcessingMode): boolean {
  return mode !== "metadata_only";
}
