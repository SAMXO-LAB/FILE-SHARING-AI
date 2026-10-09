-- 0006: Row Level Security + explicit grants.
--
-- Principles
--   * RLS is enabled on every table. Rows are visible only to their owner (files can also be
--     seen by recipients holding a live share).
--   * Supabase grants broad default privileges to anon/authenticated; we revoke them and grant
--     only what the browser-facing roles need. Anything that changes quotas, job state, import
--     state or audit data is done by the server with the service role.
--   * The `anon` role gets nothing.

do $$
declare t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- service_role bypasses RLS but FORCE would apply to table owners only; make sure the
-- server role still has table privileges.
grant all on all tables in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Catalog tables
-- ---------------------------------------------------------------------------
grant select on public.sources to authenticated;
create policy sources_read on public.sources for select to authenticated using (true);

-- reserved_usernames, rate_limits, telegram_link_codes: server only (no policies, no grants).

-- ---------------------------------------------------------------------------
-- profiles: a user sees and edits only their own row, and only safe columns.
-- Quotas, usernames (change_username()) and ids cannot be changed from the client.
-- ---------------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (display_name, avatar_url, bio, profile_visibility) on public.profiles to authenticated;
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- preferences + themes
-- ---------------------------------------------------------------------------
grant select, update on public.user_preferences to authenticated;
create policy prefs_select_own on public.user_preferences for select to authenticated using (user_id = auth.uid());
create policy prefs_update_own on public.user_preferences for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.user_themes to authenticated;
create policy themes_all_own on public.user_themes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- integrations: read + disconnect from the client; creation/status by the server
-- ---------------------------------------------------------------------------
grant select, delete on public.source_connections to authenticated;
create policy conn_select_own on public.source_connections for select to authenticated using (owner_id = auth.uid());
create policy conn_delete_own on public.source_connections for delete to authenticated using (owner_id = auth.uid());

grant select, delete on public.import_batches to authenticated;
create policy batches_select_own on public.import_batches for select to authenticated using (owner_id = auth.uid());
create policy batches_delete_own on public.import_batches for delete to authenticated using (owner_id = auth.uid());

grant select, delete on public.conversations to authenticated;
create policy conversations_select_own on public.conversations for select to authenticated using (owner_id = auth.uid());
create policy conversations_delete_own on public.conversations for delete to authenticated using (owner_id = auth.uid());

grant select, delete on public.messages to authenticated;
create policy messages_select_own on public.messages for select to authenticated using (owner_id = auth.uid());
create policy messages_delete_own on public.messages for delete to authenticated using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- folders
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.folders to authenticated;
create policy folders_all_own on public.folders for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- files
--   select: owner, or a recipient holding a live share
--   insert/delete: server only (quota reservation, storage cleanup)
--   update: owner, safe columns only
-- ---------------------------------------------------------------------------
grant select on public.files to authenticated;
grant update (display_name, folder_id, tags, description, starred, deleted_at, last_accessed_at)
  on public.files to authenticated;
create policy files_select on public.files for select to authenticated
  using (owner_id = auth.uid() or public.has_file_share(id, auth.uid()));
create policy files_update_own on public.files for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- links / notes / collections
-- ---------------------------------------------------------------------------
grant select, update (starred), delete on public.links to authenticated;
create policy links_select_own on public.links for select to authenticated using (owner_id = auth.uid());
create policy links_update_own on public.links for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy links_delete_own on public.links for delete to authenticated using (owner_id = auth.uid());

grant select, insert, update, delete on public.notes to authenticated;
create policy notes_all_own on public.notes for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

grant select, insert, update, delete on public.collections to authenticated;
create policy collections_all_own on public.collections for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

grant select, insert, delete on public.collection_items to authenticated;
create policy collection_items_select_own on public.collection_items for select to authenticated using (owner_id = auth.uid());
create policy collection_items_insert_own on public.collection_items for insert to authenticated with check (owner_id = auth.uid());
create policy collection_items_delete_own on public.collection_items for delete to authenticated using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- memory index: read-only from the client. Search always passes through RLS.
-- ---------------------------------------------------------------------------
grant select on public.memory_records to authenticated;
create policy memory_records_select_own on public.memory_records for select to authenticated
  using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- AI chats + history
-- ---------------------------------------------------------------------------
grant select, insert, update (title, filters), delete on public.ai_conversations to authenticated;
create policy ai_conv_all_own on public.ai_conversations for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

grant select, insert, delete on public.ai_messages to authenticated;
create policy ai_msg_select_own on public.ai_messages for select to authenticated using (owner_id = auth.uid());
create policy ai_msg_insert_own on public.ai_messages for insert to authenticated with check (owner_id = auth.uid());
create policy ai_msg_delete_own on public.ai_messages for delete to authenticated using (owner_id = auth.uid());

grant select, insert, delete on public.search_history to authenticated;
create policy search_history_select_own on public.search_history for select to authenticated using (owner_id = auth.uid());
create policy search_history_insert_own on public.search_history for insert to authenticated with check (owner_id = auth.uid());
create policy search_history_delete_own on public.search_history for delete to authenticated using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- jobs: users can see their own job status; only the server mutates jobs
-- ---------------------------------------------------------------------------
grant select on public.processing_jobs to authenticated;
create policy jobs_select_own on public.processing_jobs for select to authenticated using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- sharing + audit
-- ---------------------------------------------------------------------------
grant select on public.sharing_permissions to authenticated;
create policy sharing_select_parties on public.sharing_permissions for select to authenticated
  using (owner_id = auth.uid() or recipient_id = auth.uid());

grant select on public.audit_events to authenticated;
create policy audit_select_own on public.audit_events for select to authenticated using (user_id = auth.uid());
