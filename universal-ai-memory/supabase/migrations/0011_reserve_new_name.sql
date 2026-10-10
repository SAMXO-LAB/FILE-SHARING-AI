-- 0011: the app is now called "Share Files AI". Reserve usernames that could be used to impersonate it.
insert into public.reserved_usernames (name) values
  ('sharefiles'), ('sharefilesai'), ('share_files'), ('share_files_ai'), ('sharefiles_ai'), ('filesai'), ('files_ai')
on conflict do nothing;
