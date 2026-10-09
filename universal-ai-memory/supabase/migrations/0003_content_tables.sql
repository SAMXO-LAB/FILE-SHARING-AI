-- 0003: sources, connections, imports, files, folders, links, notes, collections
--
-- Ownership model: every user-owned row has owner_id -> profiles(id) ON DELETE CASCADE.
-- Cross-table references are composite (id, owner_id) so the database itself refuses a row
-- that points at another user's record.

-- ---------------------------------------------------------------------------
-- sources: static catalog of where memory can come from
-- ---------------------------------------------------------------------------
create table public.sources (
  id text primary key,
  label text not null,
  kind text not null check (kind in ('upload', 'import', 'bot', 'web', 'manual'))
);

insert into public.sources (id, label, kind) values
  ('upload', 'Uploaded files', 'upload'),
  ('whatsapp', 'WhatsApp export', 'import'),
  ('telegram', 'Telegram', 'bot'),
  ('link', 'Saved links', 'web'),
  ('note', 'Notes', 'manual'),
  ('ai_chat', 'AI chat attachments', 'upload');

-- ---------------------------------------------------------------------------
-- source_connections: a user's connection to an integration
-- ---------------------------------------------------------------------------
create table public.source_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  source_id text not null references public.sources (id),
  kind text not null check (kind in ('whatsapp_export', 'telegram_bot', 'telegram_export', 'telegram_client')),
  status text not null default 'connected' check (status in ('pending', 'connected', 'disconnected', 'error')),
  display_name text,
  -- Telegram chat id for the bot link. Not a secret, but unique across users.
  external_id text,
  permissions jsonb not null default '[]'::jsonb,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create unique index source_connections_external_key
  on public.source_connections (kind, external_id)
  where external_id is not null and status in ('connected', 'pending');
create index source_connections_owner_idx on public.source_connections (owner_id);

create trigger source_connections_set_updated_at
  before update on public.source_connections
  for each row execute function public.set_updated_at();

-- One-time codes used to link a Telegram chat to a user. Only a hash is stored.
create table public.telegram_link_codes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index telegram_link_codes_owner_idx on public.telegram_link_codes (owner_id);

-- ---------------------------------------------------------------------------
-- folders
-- ---------------------------------------------------------------------------
create table public.folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  parent_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 120 and name !~ '[/\\]'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (parent_id, owner_id) references public.folders (id, owner_id) on delete cascade
);

create unique index folders_unique_name
  on public.folders (owner_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create trigger folders_set_updated_at
  before update on public.folders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- import_batches
-- ---------------------------------------------------------------------------
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  connection_id uuid,
  source_id text not null references public.sources (id),
  kind text not null check (kind in ('whatsapp_export', 'telegram_export', 'telegram_bot')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'completed_with_warnings', 'failed')),
  file_id uuid,  -- the uploaded export (set after files exists, see below)
  display_name text,
  content_hash text,
  stats jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, owner_id),
  foreign key (connection_id, owner_id) references public.source_connections (id, owner_id) on delete set null (connection_id)
);

create index import_batches_owner_idx on public.import_batches (owner_id, created_at desc);
create unique index import_batches_no_duplicate_export
  on public.import_batches (owner_id, kind, content_hash)
  where content_hash is not null and status in ('processing', 'completed', 'completed_with_warnings');

-- ---------------------------------------------------------------------------
-- files (metadata only; bytes live in private object storage)
-- ---------------------------------------------------------------------------
create table public.files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  folder_id uuid,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 255 and display_name !~ '[/\\]'),
  bucket text not null default 'memory-files',
  storage_key text not null unique,
  declared_mime text,
  mime_type text,                       -- verified by sniffing magic bytes where possible
  category text not null default 'other'
    check (category in ('document', 'image', 'audio', 'video', 'archive', 'code', 'data', 'other')),
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  content_hash text,                    -- sha256 hex, scoped per owner (never compared across users)
  status text not null default 'uploading'
    check (status in ('uploading', 'uploaded', 'queued', 'processing', 'ready', 'failed', 'unsupported')),
  status_detail text,
  indexing_level text not null default 'none'
    check (indexing_level in ('none', 'metadata', 'text', 'semantic')),
  source_id text not null default 'upload' references public.sources (id),
  import_batch_id uuid,
  conversation_id uuid,
  sender_label text,                    -- from an import; a label, not a verified identity
  original_date timestamptz,            -- original message/modified date when known
  tags text[] not null default '{}',
  description text,
  ai_metadata jsonb not null default '{}'::jsonb,   -- summary, topics, entities, dates (AI-generated)
  extracted_text_key text,
  page_count int,
  duration_seconds numeric,
  duplicate_of uuid,
  starred boolean not null default false,
  -- 'import_source': a chat export awaiting import. Hidden from file lists, never indexed as a document.
  purpose text not null default 'memory' check (purpose in ('memory', 'import_source')),
  encryption jsonb not null default '{"at_rest":"provider-managed","end_to_end":false}'::jsonb,
  deleted_at timestamptz,
  last_accessed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (folder_id, owner_id) references public.folders (id, owner_id) on delete set null (folder_id),
  foreign key (import_batch_id, owner_id) references public.import_batches (id, owner_id) on delete set null (import_batch_id),
  constraint files_storage_key_owner check (split_part(storage_key, '/', 1) = owner_id::text)
);

create index files_owner_folder_idx on public.files (owner_id, folder_id) where deleted_at is null and purpose = 'memory';
create index files_owner_created_idx on public.files (owner_id, created_at desc);
create index files_owner_hash_idx on public.files (owner_id, content_hash) where content_hash is not null;
create index files_owner_category_idx on public.files (owner_id, category) where deleted_at is null;
create index files_trash_idx on public.files (deleted_at) where deleted_at is not null;
create index files_name_trgm_idx on public.files using gin (display_name extensions.gin_trgm_ops);
create index files_tags_idx on public.files using gin (tags);

create trigger files_set_updated_at
  before update on public.files
  for each row execute function public.set_updated_at();

alter table public.import_batches
  add foreign key (file_id, owner_id) references public.files (id, owner_id) on delete set null (file_id);

-- ---------------------------------------------------------------------------
-- conversations + messages (imported chats: WhatsApp / Telegram)
-- ---------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  source_id text not null references public.sources (id),
  connection_id uuid,
  import_batch_id uuid,
  title text not null,
  external_key text not null,           -- normalized title / chat id used to merge re-imports
  participants text[] not null default '{}',
  message_count int not null default 0,
  first_message_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (owner_id, source_id, external_key),
  foreign key (connection_id, owner_id) references public.source_connections (id, owner_id) on delete set null (connection_id),
  foreign key (import_batch_id, owner_id) references public.import_batches (id, owner_id) on delete set null (import_batch_id)
);

create index conversations_owner_idx on public.conversations (owner_id, last_message_at desc nulls last);

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

alter table public.files
  add foreign key (conversation_id, owner_id) references public.conversations (id, owner_id) on delete set null (conversation_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid not null,
  import_batch_id uuid,
  seq int not null default 0,         -- 1-based order within the conversation (see renumber_conversation)
  src_index int not null default 0,   -- position within its source export; tie-breaker for ordering
  sender_label text,
  -- 'label': a name string taken from an export (unverified);
  -- 'linked_account': the Telegram account the user linked to their own profile.
  sender_kind text not null default 'label' check (sender_kind in ('label', 'linked_account')),
  sent_at timestamptz,                  -- null when the export timestamp could not be parsed
  body text not null default '',
  kind text not null default 'text' check (kind in ('text', 'media', 'system', 'deleted')),
  attachment_name text,
  attachment_file_id uuid,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (conversation_id, dedupe_key),
  foreign key (conversation_id, owner_id) references public.conversations (id, owner_id) on delete cascade,
  foreign key (import_batch_id, owner_id) references public.import_batches (id, owner_id) on delete set null (import_batch_id),
  foreign key (attachment_file_id, owner_id) references public.files (id, owner_id) on delete set null (attachment_file_id)
);

create index messages_conversation_seq_idx on public.messages (conversation_id, seq);
create index messages_owner_sent_idx on public.messages (owner_id, sent_at desc nulls last);

-- ---------------------------------------------------------------------------
-- links + notes
-- ---------------------------------------------------------------------------
create table public.links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  url text not null check (char_length(url) <= 2048),
  normalized_url text not null,
  final_url text,
  title text,
  description text,
  site_name text,
  status text not null default 'queued' check (status in ('queued', 'fetching', 'ready', 'failed')),
  status_detail text,
  summary_requested boolean not null default false,
  summary text,
  tags text[] not null default '{}',
  starred boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (owner_id, normalized_url)
);

create index links_owner_idx on public.links (owner_id, created_at desc);

create trigger links_set_updated_at
  before update on public.links
  for each row execute function public.set_updated_at();

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default 'Untitled note' check (char_length(title) <= 200),
  body text not null default '' check (char_length(body) <= 200000),
  origin text not null default 'user' check (origin in ('user', 'ai_answer')),
  starred boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create index notes_owner_idx on public.notes (owner_id, created_at desc);

create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- collections
-- ---------------------------------------------------------------------------
create table public.collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text check (description is null or char_length(description) <= 500),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create unique index collections_unique_name on public.collections (owner_id, lower(name));

create trigger collections_set_updated_at
  before update on public.collections
  for each row execute function public.set_updated_at();

-- Exactly one of the typed foreign keys is set, so integrity is enforced by real FKs.
create table public.collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  file_id uuid,
  link_id uuid,
  note_id uuid,
  conversation_id uuid,
  added_at timestamptz not null default now(),
  foreign key (collection_id, owner_id) references public.collections (id, owner_id) on delete cascade,
  foreign key (file_id, owner_id) references public.files (id, owner_id) on delete cascade,
  foreign key (link_id, owner_id) references public.links (id, owner_id) on delete cascade,
  foreign key (note_id, owner_id) references public.notes (id, owner_id) on delete cascade,
  foreign key (conversation_id, owner_id) references public.conversations (id, owner_id) on delete cascade,
  constraint collection_items_one_target
    check (num_nonnulls(file_id, link_id, note_id, conversation_id) = 1)
);

create unique index collection_items_file_key on public.collection_items (collection_id, file_id) where file_id is not null;
create unique index collection_items_link_key on public.collection_items (collection_id, link_id) where link_id is not null;
create unique index collection_items_note_key on public.collection_items (collection_id, note_id) where note_id is not null;
create unique index collection_items_conv_key on public.collection_items (collection_id, conversation_id) where conversation_id is not null;
create index collection_items_owner_idx on public.collection_items (owner_id);
