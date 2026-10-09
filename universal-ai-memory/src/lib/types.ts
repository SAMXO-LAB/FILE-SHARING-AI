/** Row shapes used by the app (hand-written to match supabase/migrations). */
import type { FileCategory } from "@/lib/files/types";
import type { ProcessingMode } from "@/lib/ai/privacy";

export type FileStatus = "uploading" | "uploaded" | "queued" | "processing" | "ready" | "failed" | "unsupported";

export interface FileRow {
  id: string;
  owner_id: string;
  folder_id: string | null;
  display_name: string;
  bucket: string;
  storage_key: string;
  declared_mime: string | null;
  mime_type: string | null;
  category: FileCategory;
  size_bytes: number;
  content_hash: string | null;
  status: FileStatus;
  status_detail: string | null;
  indexing_level: "none" | "metadata" | "text" | "semantic";
  source_id: string;
  import_batch_id: string | null;
  conversation_id: string | null;
  sender_label: string | null;
  original_date: string | null;
  tags: string[];
  description: string | null;
  ai_metadata: {
    summary?: string;
    topics?: string[];
    entities?: string[];
    important_dates?: string[];
    category?: string;
  };
  extracted_text_key: string | null;
  page_count: number | null;
  duration_seconds: number | null;
  duplicate_of: string | null;
  starred: boolean;
  purpose: "memory" | "import_source";
  deleted_at: string | null;
  last_accessed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Preferences {
  user_id: string;
  theme: "liquid-glass" | "midnight" | "amoled" | "minimal-light" | "aurora" | "custom";
  color_mode: "system" | "light" | "dark";
  accent_color: string;
  background_style: "gradient" | "solid" | "mesh" | "none";
  sidebar_style: "glass" | "solid" | "minimal";
  border_radius: "sm" | "md" | "lg" | "xl";
  chat_bubble_style: "soft" | "outline" | "flat";
  animation_level: "none" | "subtle" | "normal" | "rich";
  high_contrast: boolean;
  sidebar_collapsed: boolean;
  processing_mode: ProcessingMode;
  semantic_indexing: boolean;
  auto_categorize: boolean;
  response_style: "concise" | "balanced" | "detailed";
  search_recency_boost: boolean;
  save_search_history: boolean;
  privacy_acknowledged_at: string | null;
  notify_upload_complete: boolean;
  notify_processing_complete: boolean;
  notify_import_failures: boolean;
  notify_security_alerts: boolean;
}

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  profile_visibility: "private" | "connections" | "public";
  username_changed_at: string | null;
  storage_quota_bytes: number;
  max_upload_bytes: number;
  created_at: string;
}

export interface LinkRow {
  id: string;
  owner_id: string;
  url: string;
  normalized_url: string;
  final_url: string | null;
  title: string | null;
  description: string | null;
  site_name: string | null;
  status: "queued" | "fetching" | "ready" | "failed";
  status_detail: string | null;
  summary_requested: boolean;
  summary: string | null;
  tags: string[];
  starred: boolean;
  created_at: string;
}

export interface NoteRow {
  id: string;
  owner_id: string;
  title: string;
  body: string;
  origin: "user" | "ai_answer";
  starred: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConversationRow {
  id: string;
  owner_id: string;
  source_id: string;
  title: string;
  participants: string[];
  message_count: number;
  first_message_at: string | null;
  last_message_at: string | null;
  created_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  seq: number;
  sender_label: string | null;
  sender_kind: "label" | "linked_account";
  sent_at: string | null;
  body: string;
  kind: "text" | "media" | "system" | "deleted";
  attachment_name: string | null;
  attachment_file_id: string | null;
}

export interface JobRow {
  id: string;
  owner_id: string;
  kind: "process_file" | "process_link" | "process_import" | "embed_pending" | "telegram_ingest";
  payload: Record<string, unknown>;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  attempts: number;
  max_attempts: number;
  run_after: string;
  last_error: string | null;
  result: Record<string, unknown> | null;
  created_at: string;
}

export interface MemoryRecordRow {
  id: string;
  owner_id: string;
  kind: "file" | "chunk" | "message_window" | "link" | "note";
  source_id: string;
  file_id: string | null;
  link_id: string | null;
  note_id: string | null;
  conversation_id: string | null;
  title: string;
  body: string;
}
