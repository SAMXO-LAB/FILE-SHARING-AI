-- 0009: friendlier profiles for accounts created through Google (or any OAuth provider).
--
-- Email sign-up sends a chosen username in the metadata. OAuth sign-ups don't, so instead of a
-- random "user1a2b3c4d" we try the email's local part (cleaned to the username rules), then that
-- name plus digits, and only then a random name. The display name comes from the provider's
-- full_name/name when the user didn't give one. Users can change the username once in Settings.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  wanted text := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
  base text;
  candidate text;
  final_name text;
  attempts int := 0;
  shown text := nullif(left(trim(coalesce(
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    '')), 80), '');
begin
  -- 1. The username chosen on the sign-up form.
  if wanted is not null and public.username_check(wanted) = 'ok' then
    final_name := wanted;
  end if;

  -- 2. Derived from the email address (e.g. "jane.doe@gmail.com" -> "jane_doe").
  if final_name is null and new.email is not null then
    base := lower(split_part(new.email, '@', 1));
    base := regexp_replace(base, '[^a-z0-9_]+', '_', 'g');
    base := regexp_replace(base, '_{2,}', '_', 'g');
    base := trim(both '_' from base);
    base := left(base, 24);
    base := trim(both '_' from base);
    if length(base) >= 3 then
      if public.username_check(base) = 'ok' then
        final_name := base;
      end if;
      while final_name is null and attempts < 10 loop
        candidate := base || (10 + floor(random() * 9990))::int::text;
        if public.username_check(candidate) = 'ok' then
          final_name := candidate;
        end if;
        attempts := attempts + 1;
      end loop;
    end if;
  end if;

  -- 3. Random fallback.
  attempts := 0;
  while final_name is null and attempts < 20 loop
    candidate := 'user' || substr(encode(gen_random_bytes(5), 'hex'), 1, 8);
    if not exists (select 1 from public.profiles p where p.username = candidate::citext) then
      final_name := candidate;
    end if;
    attempts := attempts + 1;
  end loop;

  insert into public.profiles (id, username, username_skeleton, display_name)
  values (new.id, final_name, public.username_skeleton(final_name), shown);

  insert into public.user_preferences (user_id) values (new.id);
  return new;
end;
$$;
