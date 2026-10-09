-- 0007: retrieval, quota, and queue functions

-- ---------------------------------------------------------------------------
-- terms_to_tsquery: OR together a list of already-extracted keywords.
-- Each term goes through plainto_tsquery, so user text can never inject tsquery syntax.
-- ---------------------------------------------------------------------------
create or replace function public.terms_to_tsquery(p_terms text[])
returns tsquery
language plpgsql
immutable
set search_path = public, extensions, pg_temp
as $$
declare
  q tsquery;
  t text;
  one tsquery;
begin
  if p_terms is null then
    return null;
  end if;
  foreach t in array p_terms loop
    continue when t is null or btrim(t) = '';
    one := plainto_tsquery('english', left(t, 64));
    continue when one is null or one::text = '';
    q := case when q is null then one else q || one end;
  end loop;
  return q;
end;
$$;

-- ---------------------------------------------------------------------------
-- search_memory: hybrid retrieval over the caller's own memory.
--
-- SECURITY INVOKER: row level security always applies. The explicit owner check
-- is belt-and-braces. Callers using the service role get no rows (auth.uid() is null).
--
-- Signals combined (weights are documented in docs/ARCHITECTURE.md):
--   text      0.45  full-text rank (ts_rank_cd, length-normalised)
--   semantic  0.35  cosine similarity of embeddings (only when an embedding is supplied)
--   metadata  0.12  title / file-name trigram + substring match
--   source    0.04  soft preference for sources the query mentioned
--   recency   0.04  gentle decay over ~6 months (optional, only where a date is known)
-- ---------------------------------------------------------------------------
create or replace function public.search_memory(
  p_terms text[] default null,
  p_embedding extensions.vector(1536) default null,
  p_kinds text[] default null,
  p_source_ids text[] default null,
  p_prefer_sources text[] default null,
  p_file_categories text[] default null,
  p_mime_types text[] default null,
  p_sender text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_collection_id uuid default null,
  p_file_ids uuid[] default null,
  p_conversation_id uuid default null,
  p_recency_boost boolean default true,
  p_min_similarity real default 0.30,
  p_limit int default 40
)
returns table (
  record_id uuid,
  kind text,
  source_id text,
  file_id uuid,
  link_id uuid,
  note_id uuid,
  conversation_id uuid,
  title text,
  body_excerpt text,
  page_start int,
  page_end int,
  seq_from int,
  seq_to int,
  senders text[],
  occurred_at timestamptz,
  date_kind text,
  file_category text,
  score real,
  text_score real,
  semantic_score real,
  meta_score real,
  matched_by text[]
)
language plpgsql
stable
security invoker
set search_path = public, extensions, pg_temp
as $$
declare
  me uuid := auth.uid();
  tsq tsquery := public.terms_to_tsquery(p_terms);
  has_terms boolean := tsq is not null;
  has_vec boolean := p_embedding is not null;
  lim int := least(greatest(coalesce(p_limit, 40), 1), 200);
  sender_lc text := nullif(lower(btrim(coalesce(p_sender, ''))), '');
begin
  if me is null then
    return;
  end if;

  return query
  with base as (
    select r.*, f.mime_type as f_mime
    from public.memory_records r
    left join public.files f on f.id = r.file_id and f.owner_id = r.owner_id
    where r.owner_id = me
      and (r.file_id is null or (f.id is not null and f.deleted_at is null))
      and (p_kinds is null or r.kind = any (p_kinds))
      and (p_source_ids is null or r.source_id = any (p_source_ids))
      and (p_file_categories is null or r.file_category = any (p_file_categories))
      and (p_mime_types is null or f.mime_type = any (p_mime_types))
      and (p_file_ids is null or r.file_id = any (p_file_ids))
      and (p_conversation_id is null or r.conversation_id = p_conversation_id)
      and (p_from is null or r.occurred_at >= p_from)
      and (p_to is null or r.occurred_at < p_to)
      and (sender_lc is null or exists (
            select 1 from unnest(r.senders) s where position(sender_lc in lower(s)) > 0))
      and (p_collection_id is null or exists (
            select 1 from public.collection_items ci
            where ci.collection_id = p_collection_id and ci.owner_id = me
              and (ci.file_id = r.file_id or ci.link_id = r.link_id
                   or ci.note_id = r.note_id or ci.conversation_id = r.conversation_id)))
  ),
  fts as (
    select b.id, ts_rank_cd(b.tsv, tsq, 32) as rank
    from base b
    where has_terms and b.tsv @@ tsq
    order by rank desc
    limit 200
  ),
  by_title as (
    select b.id
    from base b
    where has_terms
      and exists (
        select 1 from unnest(p_terms) t
        where length(t) >= 3 and b.title ilike '%' || replace(replace(replace(t, '\', '\\'), '%', '\%'), '_', '\_') || '%')
    limit 100
  ),
  vec as (
    select b.id, (1 - (b.embedding <=> p_embedding))::real as sim
    from base b
    where has_vec and b.embedding is not null
    order by b.embedding <=> p_embedding
    limit 100
  ),
  browse as (
    -- No terms and no embedding: a "show me recent things" request.
    select b.id
    from base b
    where not has_terms and not has_vec and b.kind in ('file', 'link', 'note', 'message_window')
    order by coalesce(b.occurred_at, b.created_at) desc
    limit lim
  ),
  candidates as (
    select id from fts
    union select id from by_title
    union select id from vec where sim >= p_min_similarity
    union select id from browse
  ),
  scored as (
    select
      b.*,
      coalesce(fts.rank, 0)::real as s_text,
      case when vec.sim is null then 0
           else least(1, greatest(0, (vec.sim - p_min_similarity) / (0.75 - p_min_similarity)))::real end as s_sem,
      case when has_terms then
        greatest(
          coalesce((select max(word_similarity(t, b.title)) from unnest(p_terms) t where length(t) >= 3), 0),
          case when b.id in (select id from by_title) then 0.6 else 0 end
        )::real
      else 0 end as s_meta,
      case when p_prefer_sources is not null and b.source_id = any (p_prefer_sources) then 1 else 0 end::real as s_src,
      case when p_recency_boost and b.occurred_at is not null
           then exp(-greatest(extract(epoch from (now() - b.occurred_at)) / 86400.0, 0) / 180.0)::real
           else 0 end as s_rec
    from base b
    join candidates c on c.id = b.id
    left join fts on fts.id = b.id
    left join vec on vec.id = b.id
  )
  select
    s.id,
    s.kind,
    s.source_id,
    s.file_id,
    s.link_id,
    s.note_id,
    s.conversation_id,
    s.title,
    left(s.body, 1500),
    s.page_start,
    s.page_end,
    s.seq_from,
    s.seq_to,
    s.senders,
    s.occurred_at,
    s.date_kind,
    s.file_category,
    (0.45 * s.s_text + 0.35 * s.s_sem + 0.12 * s.s_meta + 0.04 * s.s_src + 0.04 * s.s_rec)::real,
    s.s_text,
    s.s_sem,
    s.s_meta,
    array_remove(array[
      case when s.s_text > 0 then 'keyword' end,
      case when s.s_sem > 0 then 'semantic' end,
      case when s.s_meta > 0 then 'title' end
    ], null)
  from scored s
  order by 18 desc, s.occurred_at desc nulls last
  limit lim;
end;
$$;

revoke all on function public.search_memory from public, anon;
grant execute on function public.search_memory to authenticated;

-- ---------------------------------------------------------------------------
-- Storage usage (caller's own files, including trash and in-flight reservations)
-- ---------------------------------------------------------------------------
create or replace function public.storage_used()
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(size_bytes), 0)::bigint from public.files where owner_id = auth.uid()
$$;

revoke all on function public.storage_used from public, anon;
grant execute on function public.storage_used to authenticated;

-- ---------------------------------------------------------------------------
-- reserve_file: atomically check quota + per-file limit and create the file row.
-- Service role only. An advisory lock per owner serialises concurrent reservations.
-- ---------------------------------------------------------------------------
create or replace function public.reserve_file(
  p_owner uuid,
  p_file_id uuid,
  p_display_name text,
  p_size bigint,
  p_declared_mime text,
  p_category text,
  p_folder uuid,
  p_source_id text default 'upload',
  p_max_upload_cap bigint default null,
  p_purpose text default 'memory'
)
returns public.files
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  prof public.profiles;
  used bigint;
  per_file_cap bigint;
  row public.files;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 42));

  select * into prof from public.profiles where id = p_owner;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  per_file_cap := least(prof.max_upload_bytes, coalesce(p_max_upload_cap, prof.max_upload_bytes));
  if p_size > per_file_cap then
    raise exception 'file_too_large' using errcode = '53400', detail = per_file_cap::text;
  end if;

  select coalesce(sum(size_bytes), 0) into used from public.files where owner_id = p_owner;
  if used + p_size > prof.storage_quota_bytes then
    raise exception 'quota_exceeded' using errcode = '53100', detail = (prof.storage_quota_bytes - used)::text;
  end if;

  insert into public.files (id, owner_id, folder_id, display_name, storage_key, declared_mime, category,
                            size_bytes, source_id, status, purpose)
  values (p_file_id, p_owner, p_folder, p_display_name, p_owner::text || '/' || p_file_id::text,
          p_declared_mime, p_category, p_size, p_source_id, 'uploading', p_purpose)
  returning * into row;

  return row;
end;
$$;

revoke all on function public.reserve_file from public, anon, authenticated;
grant execute on function public.reserve_file to service_role;

-- ---------------------------------------------------------------------------
-- Job queue
-- ---------------------------------------------------------------------------
create or replace function public.claim_jobs(p_worker text, p_limit int default 5, p_kinds text[] default null)
returns setof public.processing_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Reclaim jobs whose worker died (locked for > 15 minutes).
  update public.processing_jobs
     set status = case when attempts >= max_attempts then 'failed' else 'queued' end,
         last_error = coalesce(last_error, 'Worker stopped before finishing'),
         locked_at = null, locked_by = null
   where status = 'running' and locked_at < now() - interval '15 minutes';

  return query
  with picked as (
    select j.id
    from public.processing_jobs j
    where j.status = 'queued' and j.run_after <= now()
      and (p_kinds is null or j.kind = any (p_kinds))
    order by j.run_after
    for update skip locked
    limit greatest(p_limit, 1)
  )
  update public.processing_jobs j
     set status = 'running', locked_at = now(), locked_by = p_worker, attempts = j.attempts + 1
    from picked
   where j.id = picked.id
  returning j.*;
end;
$$;

revoke all on function public.claim_jobs from public, anon, authenticated;
grant execute on function public.claim_jobs to service_role;

-- Atomic enqueue with de-duplication (returns the job id, new or existing).
create or replace function public.enqueue_job(
  p_owner uuid, p_kind text, p_payload jsonb default '{}'::jsonb,
  p_dedupe_key text default null, p_run_after timestamptz default now(), p_max_attempts int default 3
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  job_id uuid;
begin
  insert into public.processing_jobs (owner_id, kind, payload, dedupe_key, run_after, max_attempts)
  values (p_owner, p_kind, coalesce(p_payload, '{}'::jsonb), p_dedupe_key, p_run_after, p_max_attempts)
  on conflict (dedupe_key) where dedupe_key is not null and status in ('queued', 'running') do nothing
  returning id into job_id;

  if job_id is null then
    select id into job_id from public.processing_jobs
     where dedupe_key = p_dedupe_key and status in ('queued', 'running') limit 1;
  end if;
  return job_id;
end;
$$;

revoke all on function public.enqueue_job from public, anon, authenticated;
grant execute on function public.enqueue_job to service_role;

-- Keep conversation stats in sync after imports (service role).
create or replace function public.refresh_conversation_stats(p_conversation uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.conversations c
     set message_count = s.cnt,
         first_message_at = s.first_at,
         last_message_at = s.last_at,
         participants = coalesce(s.people, '{}')
    from (
      select count(*)::int as cnt,
             min(sent_at) as first_at,
             max(sent_at) as last_at,
             array_agg(distinct sender_label) filter (where sender_label is not null) as people
        from public.messages where conversation_id = p_conversation
    ) s
   where c.id = p_conversation
$$;

revoke all on function public.refresh_conversation_stats from public, anon, authenticated;
grant execute on function public.refresh_conversation_stats to service_role;

-- Audit helper for security-definer flows (service role or definer functions only).
create or replace function public.write_audit(
  p_user uuid, p_event text, p_target_type text default null, p_target_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.audit_events (user_id, event, target_type, target_id, metadata)
  values (p_user, p_event, p_target_type, p_target_id, coalesce(p_metadata, '{}'::jsonb))
$$;

revoke all on function public.write_audit from public, anon, authenticated;
grant execute on function public.write_audit to service_role;

-- Lock down remaining sensitive helpers from the API roles.
revoke all on function public.username_check from public, anon, authenticated;
grant execute on function public.username_check to service_role;
revoke all on function public.rate_limit_hit from public, anon, authenticated;
grant execute on function public.rate_limit_hit to service_role;
revoke all on function public.change_username from public, anon;
grant execute on function public.change_username to authenticated;
revoke all on function public.has_file_share from public, anon;
grant execute on function public.has_file_share to authenticated, service_role;

-- Bulk-set embeddings for many records at once (service role; used by the indexing pipeline).
create or replace function public.set_embeddings(p_ids uuid[], p_vectors text[], p_model text)
returns int
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  with u as (
    select unnest(p_ids) as id, unnest(p_vectors)::extensions.vector(1536) as v
  ), upd as (
    update public.memory_records r
       set embedding = u.v, embedding_model = p_model, embedded_at = now()
      from u
     where r.id = u.id
    returning 1
  )
  select count(*)::int from upd
$$;

revoke all on function public.set_embeddings from public, anon, authenticated;
grant execute on function public.set_embeddings to service_role;

-- Re-number messages of a conversation by time (re-imports may interleave older messages).
create or replace function public.renumber_conversation(p_conversation uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.messages m
     set seq = r.rn
    from (
      select id, row_number() over (order by sent_at nulls last, src_index, created_at, id)::int as rn
        from public.messages where conversation_id = p_conversation
    ) r
   where m.id = r.id and m.seq is distinct from r.rn
$$;

revoke all on function public.renumber_conversation from public, anon, authenticated;
grant execute on function public.renumber_conversation to service_role;
