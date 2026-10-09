-- 0004: universal memory index, AI conversations, search history, job queue

-- ---------------------------------------------------------------------------
-- memory_records: the unified retrieval index.
-- One normalized core shape; source-specific detail stays on the owning tables
-- (files / messages / links / notes) and is referenced, never copied wholesale.
--
-- kind:
--   file            one per file, searchable by name/metadata/AI summary
--   chunk           a passage of extracted file text (with page range)
--   message_window  a run of consecutive imported messages (context for retrieval)
--   link            one per saved link (title, description, fetched text excerpt)
--   note            one per note
-- (This table also plays the role of "file_chunks" and "document_embeddings":
--  chunks and their vectors live together so a single query can rank both.)
-- ---------------------------------------------------------------------------
create table public.memory_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('file', 'chunk', 'message_window', 'link', 'note')),
  source_id text not null references public.sources (id),
  file_id uuid,
  link_id uuid,
  note_id uuid,
  conversation_id uuid,
  import_batch_id uuid,
  title text not null default '',
  body text not null default '',
  file_category text,
  chunk_index int,
  page_start int,
  page_end int,
  seq_from int,
  seq_to int,
  senders text[] not null default '{}',     -- labels from imports; unverified
  occurred_at timestamptz,                  -- the original date, when known
  date_kind text check (date_kind in ('sent', 'modified', 'uploaded', 'imported', 'saved', 'created')),
  tsv tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'B')
  ) stored,
  embedding extensions.vector(1536),
  embedding_model text,
  embedded_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (file_id, owner_id) references public.files (id, owner_id) on delete cascade,
  foreign key (link_id, owner_id) references public.links (id, owner_id) on delete cascade,
  foreign key (note_id, owner_id) references public.notes (id, owner_id) on delete cascade,
  foreign key (conversation_id, owner_id) references public.conversations (id, owner_id) on delete cascade,
  foreign key (import_batch_id, owner_id) references public.import_batches (id, owner_id) on delete cascade,
  constraint memory_records_has_source_ref check (
    num_nonnulls(file_id, link_id, note_id, conversation_id) >= 1
  )
);

create index memory_records_owner_kind_idx on public.memory_records (owner_id, kind);
create index memory_records_file_idx on public.memory_records (file_id) where file_id is not null;
create index memory_records_link_idx on public.memory_records (link_id) where link_id is not null;
create index memory_records_note_idx on public.memory_records (note_id) where note_id is not null;
create index memory_records_conv_idx on public.memory_records (conversation_id, seq_from) where conversation_id is not null;
create index memory_records_tsv_idx on public.memory_records using gin (tsv);
create index memory_records_title_trgm_idx on public.memory_records using gin (title extensions.gin_trgm_ops);
create index memory_records_senders_idx on public.memory_records using gin (senders);
create index memory_records_occurred_idx on public.memory_records (owner_id, occurred_at desc nulls last);
create index memory_records_embedding_idx on public.memory_records
  using hnsw (embedding extensions.vector_cosine_ops);
create index memory_records_unembedded_idx on public.memory_records (owner_id)
  where embedding is null and kind in ('chunk', 'message_window', 'note', 'link');

-- ---------------------------------------------------------------------------
-- AI conversations (the Ask AI chat history)
-- ---------------------------------------------------------------------------
create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default 'New chat' check (char_length(title) <= 200),
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create index ai_conversations_owner_idx on public.ai_conversations (owner_id, updated_at desc);

create trigger ai_conversations_set_updated_at
  before update on public.ai_conversations
  for each row execute function public.set_updated_at();

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '' check (char_length(content) <= 100000),
  -- For assistant messages: citations + item references + mode. Cards store only
  -- identifiers; they are re-resolved (and re-authorized) every time they are shown.
  structured jsonb not null default '{}'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (conversation_id, owner_id) references public.ai_conversations (id, owner_id) on delete cascade
);

create index ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);

create table public.search_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  query text not null check (char_length(query) <= 2000),
  filters jsonb not null default '{}'::jsonb,
  result_count int not null default 0,
  created_at timestamptz not null default now()
);

create index search_history_owner_idx on public.search_history (owner_id, created_at desc);

-- ---------------------------------------------------------------------------
-- processing_jobs: persistent queue. Work never depends on an open browser request.
-- ---------------------------------------------------------------------------
create table public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in (
    'process_file', 'process_link', 'process_import', 'embed_pending', 'telegram_ingest'
  )),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  attempts int not null default 0,
  max_attempts int not null default 3,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  result jsonb,
  -- Prevents queuing the same unit of work twice while one is still active.
  dedupe_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index processing_jobs_active_dedupe
  on public.processing_jobs (dedupe_key)
  where dedupe_key is not null and status in ('queued', 'running');
create index processing_jobs_claim_idx on public.processing_jobs (run_after) where status = 'queued';
create index processing_jobs_owner_idx on public.processing_jobs (owner_id, created_at desc);

create trigger processing_jobs_set_updated_at
  before update on public.processing_jobs
  for each row execute function public.set_updated_at();
