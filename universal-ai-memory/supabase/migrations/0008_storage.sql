-- 0008: private storage bucket + object policies
--
-- The bucket is PRIVATE: there is never a permanent public URL for a file.
-- Reads go through short-lived signed URLs minted by the server after an authorization check.
--
-- Uploads: a client may write an object only if the server has already created a matching
-- reservation row in public.files (status 'uploading') for that exact key and owner. That row
-- is only created by reserve_file(), which enforces per-file limits and the storage quota,
-- so clients cannot fill the bucket by writing straight to storage.
-- Deletes/updates: server (service role) only.

insert into storage.buckets (id, name, public)
values ('memory-files', 'memory-files', false)
on conflict (id) do update set public = false;

create policy "memory-files: owner can upload reserved keys"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'memory-files'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.files f
      where f.storage_key = name and f.owner_id = auth.uid() and f.status = 'uploading'
    )
  );

create policy "memory-files: owner can read own objects"
  on storage.objects for select to authenticated
  using (bucket_id = 'memory-files' and (storage.foldername(name))[1] = auth.uid()::text);
