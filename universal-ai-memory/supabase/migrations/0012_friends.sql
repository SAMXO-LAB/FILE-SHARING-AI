-- 0012: Friends and direct messages ("Send to friends").
-- A friendship is requested by username and must be accepted. Accepted friends get a private chat
-- where they can send text and files. Sending a file creates a normal sharing_permissions grant
-- (accepted, no expiry) so all existing access checks, revocation and auditing still apply.
-- Writes go through the server (service role) like sharing; users can read only their own rows.

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'blocked')),
  blocked_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  last_message_at timestamptz,
  constraint friendship_not_self check (requester_id <> addressee_id)
);

-- One row per pair of people, whoever asked first.
create unique index if not exists friendships_pair_unique
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_requester_idx on public.friendships (requester_id, status);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id, status);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  friendship_id uuid not null references public.friendships (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  body text check (body is null or char_length(body) <= 4000),
  file_id uuid references public.files (id) on delete set null,
  share_id uuid references public.sharing_permissions (id) on delete set null,
  -- Snapshot so the message still reads sensibly after the file is deleted or access is revoked.
  file_name text check (file_name is null or char_length(file_name) <= 255),
  file_size bigint,
  file_category text,
  file_mime text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint dm_has_content check (body is not null or file_name is not null),
  constraint dm_not_self check (sender_id <> recipient_id)
);

create index if not exists direct_messages_thread_idx on public.direct_messages (friendship_id, created_at desc);
create index if not exists direct_messages_unread_idx on public.direct_messages (recipient_id) where read_at is null;

alter table public.friendships enable row level security;
alter table public.direct_messages enable row level security;

-- New tables inherit Supabase's broad default grants; strip them so only reads are possible.
revoke all on public.friendships from anon, authenticated;
revoke all on public.direct_messages from anon, authenticated;
grant select on public.friendships to authenticated;
grant select on public.direct_messages to authenticated;

drop policy if exists friendships_select_parties on public.friendships;
create policy friendships_select_parties on public.friendships for select to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists direct_messages_select_parties on public.direct_messages;
create policy direct_messages_select_parties on public.direct_messages for select to authenticated
  using (auth.uid() = sender_id or auth.uid() = recipient_id);
