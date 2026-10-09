-- 0005: private sharing, audit events, rate limiting

-- ---------------------------------------------------------------------------
-- sharing_permissions: explicit, revocable, expiring grants of a file to another user.
-- A recipient must ACCEPT before access starts. Revocation stops hosted access;
-- it cannot erase copies a recipient already downloaded.
-- ---------------------------------------------------------------------------
create table public.sharing_permissions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  file_id uuid not null,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'revoked')),
  can_download boolean not null default true,
  note text check (note is null or char_length(note) <= 500),
  expires_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (file_id, owner_id) references public.files (id, owner_id) on delete cascade,
  constraint sharing_not_self check (owner_id <> recipient_id),
  constraint sharing_expiry_future check (expires_at is null or expires_at > created_at)
);

create unique index sharing_active_unique
  on public.sharing_permissions (file_id, recipient_id)
  where status in ('pending', 'accepted');
create index sharing_recipient_idx on public.sharing_permissions (recipient_id, status);
create index sharing_owner_idx on public.sharing_permissions (owner_id);

-- True when `p_user` currently holds a live (accepted, unexpired, unrevoked) grant on the file.
create or replace function public.has_file_share(p_file uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sharing_permissions s
    join public.files f on f.id = s.file_id
    where s.file_id = p_file
      and s.recipient_id = p_user
      and s.status = 'accepted'
      and (s.expires_at is null or s.expires_at > now())
      and f.deleted_at is null
  )
$$;

-- ---------------------------------------------------------------------------
-- audit_events: append-only security/sharing log. Written by the server (service role)
-- or by security-definer functions; users can only read their own.
-- ---------------------------------------------------------------------------
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  event text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_user_idx on public.audit_events (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- rate_limits: fixed-window counters shared across serverless instances.
-- Server-only (service role); RLS is enabled with no policies.
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key, window_start)
);

create or replace function public.rate_limit_hit(p_key text, p_window_seconds int, p_max int)
returns table (allowed boolean, remaining int, retry_after_seconds int)
language plpgsql
security definer
set search_path = public
as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  h int;
begin
  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, w, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning r.hits into h;

  -- Opportunistic cleanup of old windows.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  allowed := h <= p_max;
  remaining := greatest(p_max - h, 0);
  retry_after_seconds := case when h <= p_max then 0
    else greatest(1, ceil(extract(epoch from (w + make_interval(secs => p_window_seconds) - now())))::int) end;
  return next;
end;
$$;
