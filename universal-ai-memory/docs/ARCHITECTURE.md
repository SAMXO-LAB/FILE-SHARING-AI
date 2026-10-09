# Architecture

## Shape of the system

```
Browser (React, Tailwind, tus uploads)
   │  cookies (Supabase session)             │  tus resumable upload, user's access token
   ▼                                          ▼
Next.js App Router ── route handlers ──▶ Supabase Storage (private bucket `memory-files`)
   │   src/proxy.ts: session refresh, redirects, nonce CSP
   │
   ├─ user-scoped Supabase client  ──▶ Postgres with RLS (everything a user reads/writes directly)
   └─ service-role client (server only) ─▶ quota reservation, job queue, imports, audit, sharing lookups
                                            │
                     persistent queue `processing_jobs` ◀── after() kick, /api/jobs/run (cron), npm run worker
                                            │
                          extract → chunk → (enrich) → (embed) → `memory_records` (one unified index)
                                            │
                    search_memory() hybrid SQL ──▶ evidence → AI layer ──▶ cited answer + backend-built cards
```

## Data model (supabase/migrations)

| File | Contents |
| --- | --- |
| `0001` | extensions (pgvector, pg_trgm, unaccent), helpers |
| `0002` | `profiles` (case-insensitive unique username, reserved names), `user_preferences`, `user_themes` |
| `0003` | `files`, `folders`, `links`, `notes`, `collections` + items, `conversations`/`messages` (imports), `source_connections`, `import_batches`, `sources` |
| `0004` | `memory_records` (unified index: file, chunk, message_window, link, note), `processing_jobs`, `ai_conversations`/`ai_messages`, `search_history`, telegram link codes |
| `0005` | `sharing_permissions`, `audit_events`, `rate_limits` |
| `0006` | RLS policies and column-limited grants |
| `0007` | functions: `reserve_file`, `claim_jobs`, `enqueue_job`, `rate_limit_hit`, `username_check`, `change_username`, `write_audit`, `set_embeddings`, `search_memory`, … |
| `0008` | private storage bucket and its insert policy |

Row level security is enabled on every table. Browser-reachable roles get only the columns they need; the service role is used for quota accounting, the queue, imports, audit writes and webhooks, and every such call passes the owner id explicitly.

`search_memory` is `SECURITY INVOKER`: RLS decides what a caller can see, so a search can never return another person's row. Shared files appear only through `has_file_share`, which checks an accepted, unexpired, unrevoked share.

## Upload pipeline

1. `POST /api/files/init`: validates name/size, checks the quota atomically (`reserve_file`), and creates a `files` row with `status='uploading'`. Returns a duplicate if the same SHA-256 already exists (client pre-hash for files ≤ 64 MB).
2. The browser uploads straight to Storage with tus. The bucket's insert policy only allows keys that match an `uploading` row owned by the caller.
3. `POST /api/files/[id]/complete`: the server re-reads the **real** object size, enforces per-file limit and quota again, sniffs magic bytes (executables refused, declared type never trusted), optionally scans with ClamAV (fails closed), then queues `process_file`.
4. A worker extracts text with format-specific parsers (zip-bomb limits on Office files), chunks it, optionally summarises and embeds it per the user's privacy policy, and writes `memory_records`. Failures are shown on the file ("encrypted PDF", "no text layer found") rather than hidden.

## Retrieval and answers

1. `interpret.ts` reads the question heuristically (sender, date range, type, source, intent such as summarize/compare/find) and resolves follow-ups ("the second PDF") against the cards shown in the previous turn.
2. `search_memory` combines full-text rank, vector similarity (when embeddings are on), trigram/metadata matches, source and recency.
3. Evidence is assembled from the hits. If the privacy policy and a configured provider allow it, the model writes a structured answer from that evidence only; otherwise the answer is the matching passages themselves.
4. **Cards and citations are built by the backend** from real rows (and re-resolved through RLS every time a chat is reopened). The model never produces file names, links, or message references that reach the UI. In-app hrefs only.

### Prompt-injection defenses

- Retrieved text is wrapped in a per-request random-token fence and the system prompt tells the model it is untrusted data (`DOCUMENT_GUARD`).
- The model has no tools and can't take actions; output is parsed as JSON and validated with Zod.
- Citation markers (`[E3]`) must correspond to evidence that was actually supplied; any other marker is removed from the answer (`resolveCitationMarkers`).
- Link fetching and attachment handling happen server-side with SSRF protection; fetched page text is treated like any other untrusted document.

## Privacy modes

`metadata_only` (names/dates only) → `extraction` (default; text read on the server, nothing sent to AI) → `local` (self-hosted endpoint declared via `AI_PROVIDER_LOCALITY=local`) → `cloud_ai` (passages may go to the configured provider). `mayUseAi(mode, locality)` is the single gate; every AI/embedding/enrichment call goes through `Policy`.

Nothing here is end-to-end encrypted, and the product never claims it is.

## Security controls

- **Auth**: Supabase Auth; `proxy.ts` refreshes sessions; every route and page re-validates with `auth.getUser()`.
- **Usernames**: unique case-insensitively, reserved names and look-alike/impersonation patterns blocked, 14-day change cooldown.
- **CSRF**: same-origin check on every state-changing API call.
- **Headers**: nonce-based CSP (`script-src 'self' 'nonce-…' 'strict-dynamic'`), HSTS, frame denial, nosniff, referrer and permissions policies.
- **Rate limiting**: database-backed counters (shared across instances) with an in-memory fallback.
- **Files**: private bucket, 60-second signed URLs, downloads are forced to `attachment`, PDFs open in a new tab instead of an embedded frame, HTML files are previewed as plain text (never rendered), SVG is shown only through an `<img>` (which doesn't run scripts), and the app's CSP only allows the storage origin for media.
- **Uploads are untrusted**: see the pipeline above. Chat export files are parsed then deleted.
- **SSRF-safe fetch**: scheme/port allow-list, DNS resolution pinned to the checked address, private/loopback/link-local/metadata ranges blocked (v4 and v6), redirects re-validated, size and time limits.
- **Audit log**: account, sharing and import events; shared-file views and downloads are recorded for the owner.
- **Data export and deletion**: Settings → Account → download JSON; account deletion removes stored objects first, then the auth user (cascading every row).
- **Custom themes** are validated colour/number tokens mapped to CSS variables by us. No user CSS or JavaScript is ever accepted.

## Theming

`<html>` carries `data-theme`, `data-mode`, `data-color-mode`, `data-bg`, `data-sidebar-style`, `data-bubble`, `data-anim`, `data-contrast`, plus CSS variables for accent and radius. An inline, nonce'd script resolves "system" mode before first paint (no flash), and `applyThemeToDom` gives live preview in Settings.

## Deliberately not included

- **File versions.** Replacing a file replaces it.
- **End-to-end encrypted messaging.** Not claimed, not built.
- **Automatic WhatsApp sync.** WhatsApp doesn't offer it to apps like this. Import is by export file.
- **Telegram client API.** Reading a personal account is not offered; the architecture (`source_connections.kind = 'telegram_client'`) leaves room for it.
- **Telegram HTML exports.** JSON only.
- **Deep links into WhatsApp/Telegram.** Results open the copy saved here.

## Known limitations

- Answers in Ask AI keep short cited quotes in chat history until that chat is deleted (stated in Settings → Privacy).
- The inline job kick after an upload is best-effort; durability comes from the queue and a worker/cron.
- Sign-in events are held by Supabase Auth, so the in-app activity list doesn't show them.
