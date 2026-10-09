-- 0002: profiles, usernames, preferences, themes

-- ---------------------------------------------------------------------------
-- Reserved usernames (system names, common impersonation targets)
-- ---------------------------------------------------------------------------
create table public.reserved_usernames (
  name extensions.citext primary key
);

insert into public.reserved_usernames (name) values
  ('admin'), ('administrator'), ('root'), ('system'), ('support'), ('help'), ('security'),
  ('staff'), ('team'), ('official'), ('moderator'), ('mod'), ('owner'), ('api'), ('www'),
  ('mail'), ('email'), ('billing'), ('abuse'), ('privacy'), ('legal'), ('noreply'),
  ('no_reply'), ('null'), ('undefined'), ('me'), ('you'), ('everyone'), ('all'), ('anonymous'),
  ('universal'), ('universalai'), ('universal_ai'), ('aimemory'), ('ai_memory'), ('memory'),
  ('settings'), ('login'), ('signup'), ('logout'), ('auth'), ('app'), ('bot'), ('telegram'),
  ('whatsapp'), ('anthropic'), ('openai'), ('google'), ('microsoft'), ('apple')
on conflict do nothing;

-- Skeleton used to block look-alike usernames (a1ex vs alex, ali_ce vs alice, ...).
create or replace function public.username_skeleton(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(
           translate(lower(p), '01l34578$@', 'oiieastbsa'),
           '[_]+', '', 'g')
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username extensions.citext not null,
  username_skeleton text not null,
  display_name text,
  avatar_url text,
  bio text,
  profile_visibility text not null default 'private'
    check (profile_visibility in ('private', 'connections', 'public')),
  username_changed_at timestamptz,
  storage_quota_bytes bigint not null default 5368709120 check (storage_quota_bytes >= 0),
  max_upload_bytes bigint not null default 2147483648 check (max_upload_bytes > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format
    check (username::text ~ '^[a-zA-Z0-9_]{3,30}$' and username::text !~ '^_|_$|__'),
  constraint profiles_display_name_len check (display_name is null or char_length(display_name) <= 80),
  constraint profiles_bio_len check (bio is null or char_length(bio) <= 500)
);

-- Case-insensitive uniqueness comes from citext; the skeleton blocks look-alikes.
create unique index profiles_username_key on public.profiles (username);
create unique index profiles_username_skeleton_key on public.profiles (username_skeleton);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Validates a username against format + reserved list. Returns an error code or null.
create or replace function public.username_problem(p text)
returns text
language plpgsql
stable
as $$
begin
  if p is null or p !~ '^[a-zA-Z0-9_]{3,30}$' then
    return 'invalid_format';
  end if;
  if p ~ '^_|_$|__' then
    return 'invalid_format';
  end if;
  if exists (select 1 from public.reserved_usernames r where r.name = p::extensions.citext) then
    return 'reserved';
  end if;
  if exists (
    select 1 from public.reserved_usernames r
    where public.username_skeleton(r.name::text) = public.username_skeleton(p)
  ) then
    return 'reserved';
  end if;
  return null;
end;
$$;

create or replace function public.profiles_enforce_username()
returns trigger
language plpgsql
as $$
declare
  problem text;
begin
  new.username_skeleton := public.username_skeleton(new.username::text);

  if tg_op = 'INSERT' or new.username is distinct from old.username then
    problem := public.username_problem(new.username::text);
    if problem is not null then
      raise exception 'username_%', problem using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_enforce_username
  before insert or update of username on public.profiles
  for each row execute function public.profiles_enforce_username();

-- Create a profile and default preferences whenever an auth user is created.
-- If the requested username is missing/invalid/taken, fall back to a random one
-- so sign-up never fails inside the auth transaction. The app validates up front.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  wanted text := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
  final_name text;
  attempts int := 0;
begin
  if wanted is not null
     and public.username_problem(wanted) is null
     and not exists (select 1 from public.profiles p where p.username = wanted::citext)
     and not exists (select 1 from public.profiles p where p.username_skeleton = public.username_skeleton(wanted)) then
    final_name := wanted;
  end if;

  while final_name is null and attempts < 20 loop
    final_name := 'user' || substr(encode(gen_random_bytes(5), 'hex'), 1, 8);
    if exists (select 1 from public.profiles p where p.username = final_name::citext) then
      final_name := null;
    end if;
    attempts := attempts + 1;
  end loop;

  insert into public.profiles (id, username, username_skeleton, display_name)
  values (
    new.id,
    final_name,
    public.username_skeleton(final_name),
    nullif(left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 80), '')
  );

  insert into public.user_preferences (user_id) values (new.id);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- user_preferences
-- ---------------------------------------------------------------------------
create table public.user_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- appearance
  theme text not null default 'liquid-glass'
    check (theme in ('liquid-glass', 'midnight', 'amoled', 'minimal-light', 'aurora', 'custom')),
  color_mode text not null default 'system' check (color_mode in ('system', 'light', 'dark')),
  accent_color text not null default '#7c8cff' check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  background_style text not null default 'gradient' check (background_style in ('gradient', 'solid', 'mesh', 'none')),
  sidebar_style text not null default 'glass' check (sidebar_style in ('glass', 'solid', 'minimal')),
  border_radius text not null default 'lg' check (border_radius in ('sm', 'md', 'lg', 'xl')),
  chat_bubble_style text not null default 'soft' check (chat_bubble_style in ('soft', 'outline', 'flat')),
  animation_level text not null default 'normal' check (animation_level in ('none', 'subtle', 'normal', 'rich')),
  high_contrast boolean not null default false,
  sidebar_collapsed boolean not null default false,
  -- AI / privacy
  -- metadata_only: index names/metadata only; extraction: server extracts text for keyword search,
  -- nothing is sent to an AI provider; local: AI features use a self-hosted provider;
  -- cloud_ai: extracted content may be sent to the configured cloud AI provider.
  processing_mode text not null default 'extraction'
    check (processing_mode in ('metadata_only', 'extraction', 'local', 'cloud_ai')),
  semantic_indexing boolean not null default true,
  auto_categorize boolean not null default true,
  response_style text not null default 'balanced' check (response_style in ('concise', 'balanced', 'detailed')),
  search_recency_boost boolean not null default true,
  save_search_history boolean not null default true,
  privacy_acknowledged_at timestamptz,
  -- notifications
  notify_upload_complete boolean not null default true,
  notify_processing_complete boolean not null default true,
  notify_import_failures boolean not null default true,
  notify_security_alerts boolean not null default true,
  updated_at timestamptz not null default now()
);

create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- Custom theme tokens. Values are constrained to colors/enums: never raw CSS or JS.
create table public.user_themes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null default 'Custom' check (char_length(name) between 1 and 40),
  tokens jsonb not null default '{}'::jsonb
    check (jsonb_typeof(tokens) = 'object' and pg_column_size(tokens) < 4096),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create trigger user_themes_set_updated_at
  before update on public.user_themes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Username helpers exposed to the app
-- ---------------------------------------------------------------------------

-- Availability check (called by the server only, rate limited there).
create or replace function public.username_check(p text)
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(
    public.username_problem(p),
    case when exists (select 1 from public.profiles x where x.username = p::citext)
           or exists (select 1 from public.profiles x where x.username_skeleton = public.username_skeleton(p))
         then 'taken' end,
    'ok'
  )
$$;

-- Users may change their username at most once every 14 days.
create or replace function public.change_username(p_new text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  me uuid := auth.uid();
  last_change timestamptz;
  current_name text;
  check_result text;
begin
  if me is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select username::text, username_changed_at into current_name, last_change
  from public.profiles where id = me for update;

  if current_name = p_new then
    return;
  end if;

  if last_change is not null and last_change > now() - interval '14 days' then
    raise exception 'username_change_cooldown' using errcode = '22023';
  end if;

  -- Allow case-only changes of one's own name; otherwise require availability.
  if lower(current_name) <> lower(p_new) then
    check_result := public.username_check(p_new);
    if check_result <> 'ok' then
      raise exception 'username_%', check_result using errcode = '22023';
    end if;
  else
    check_result := public.username_problem(p_new);
    if check_result is not null then
      raise exception 'username_%', check_result using errcode = '22023';
    end if;
  end if;

  update public.profiles
     set username = p_new, username_changed_at = now()
   where id = me;
end;
$$;

-- Wire the new-user trigger (after the tables it writes to exist).
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
