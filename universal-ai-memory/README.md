# Universal AI Memory

Put your files, links, notes and chat exports in one private place, then ask questions about them in plain language. Answers come with sources, and everything shown (files, messages, links) is a real item from your own memory.

```
add / upload / import  →  extract + index  →  ask a question  →  retrieve  →  cited answer + related files
```

Built with Next.js (App Router), React, strict TypeScript, Tailwind, Supabase (Auth, Postgres with row level security, private Storage, full-text search, pgvector), and a provider-independent AI layer.

## What works today

| Area | Status |
| --- | --- |
| Accounts: sign up / in / out, email verification, password reset, account deletion, unique case-insensitive usernames with reserved names | Done |
| Uploads: resumable (tus) direct-to-storage, progress, cancel, retry, duplicate detection, drag and drop anywhere, folders, mobile pickers | Done |
| Upload safety: server-side size/quota check, magic-byte type verification, executables refused, optional ClamAV scan (fails closed), safe preview headers | Done |
| Extraction: PDF, Word, Excel, PowerPoint, text/Markdown/CSV/JSON/XML/HTML, code; OCR and audio/video transcription when configured | Done (OCR/transcription need credentials) |
| Saved links with an SSRF-safe fetcher; notes; collections; tags; trash with 30-day restore | Done |
| Hybrid search: keyword + semantic (if embeddings configured) + metadata/sender/date + recency, permission-checked on every result | Done |
| Ask AI: cited answers, follow-ups ("summarize the second PDF", "compare it with the first"), save as note, export | Done (written answers need an AI provider; without one you get matching passages) |
| Document assistant: summaries, entities, dates, topics, comparison, study guide, honest OCR/extraction failures | Done (needs an AI provider) |
| WhatsApp **export import** (Android + iOS formats) | Done. There is no automatic WhatsApp sync, and the UI says so |
| Telegram bot (link code, webhook) and Telegram **JSON export import** | Done (bot needs a token) |
| Private sharing: explicit, per-recipient, expiring, revocable, audited, signed URLs | Done |
| Settings: account, appearance (5 themes + custom), privacy modes, storage, AI, notifications | Done |
| Security: RLS on every table, rate limiting, CSRF origin check, nonce CSP + headers, audit log, data export | Done |

Not built, on purpose (see `docs/ARCHITECTURE.md` → *Deliberately not included*): file versions, end-to-end encrypted messaging, automatic WhatsApp sync, Telegram client API (reading your personal account), Telegram HTML exports.

## Run it locally

You need Node 20.9+, Docker (for the Supabase CLI) and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
npm install
supabase start                 # starts local Postgres, Auth and Storage; prints URLs and keys
supabase db reset              # applies supabase/migrations/0001…0008
cp .env.example .env.local     # then fill in the values printed by `supabase start`
npm run dev                    # http://localhost:3000
```

In `.env.local` set at minimum `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the anon/publishable key), `SUPABASE_SECRET_KEY` (service role) and `CRON_SECRET`. Open the app, create an account, and use **+ Add to Memory**. Until the first account exists the home page shows the empty state; nothing is pre-filled.

Background processing (reading files, fetching links, imports) is queued in the database and also started right after each upload. For reliability, in a second terminal run:

```bash
npm run worker
```

or call `/api/jobs/run` from a scheduler (see `docs/DEPLOYMENT.md`).

Optional: `npm run seed -- you@example.test 'a-long-password-1'` creates a test account with three clearly labelled sample notes. It's a development helper only; the app itself never shows sample data.

If Supabase isn't configured the app shows a `/setup` page that says exactly which variables are missing.

## What needs credentials

Everything below is optional. The app is fully usable without it, and each missing piece is shown honestly in **Settings → AI** and wherever it matters.

| You want | Set | Without it |
| --- | --- | --- |
| Written answers, summaries, auto-tags | `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL` (+ `AI_BASE_URL` for compatible/local endpoints) | Ask AI lists matching passages and files |
| Semantic ("by meaning") search | `EMBEDDING_MODEL` (1536-dim) and a key | Keyword, name, date and sender search |
| Text from images / scanned pages | `OCR_WITH_VISION_MODEL=true` and a vision-capable model | Images are indexed by name and metadata |
| Audio / video transcripts | `TRANSCRIPTION_MODEL` and a key | Indexed by name and metadata |
| Telegram bot | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`, a public HTTPS URL | Telegram export import still works |
| Malware scanning | `CLAMAV_HOST` (+ `CLAMAV_PORT`) | Type verification and executable blocking still apply |
| Scheduled jobs | `CRON_SECRET` | Use `npm run worker` instead |

Privacy modes decide whether content may reach an AI provider at all (Settings → Privacy). The default, *Text extraction*, never sends content to a third party.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` / `lint` | TypeScript and ESLint |
| `npm run test:unit` | Pure-logic tests (parsers, SSRF, MIME, retrieval interpretation, themes…) |
| `npm run db:test:up` then `npm run test:db` | Row level security, quotas, queue, storage policy, sharing and search against a real local Postgres + pgvector |
| `npm run test:smoke` | Headless-browser smoke test of every page (after `npm run build`) |
| `npm run worker` | Background job worker + housekeeping |
| `npm run telegram:webhook -- https://your-domain` | Points your Telegram bot at the app |
| `npm run seed -- <email> <password>` | Dev-only sample account |

Details: `docs/TESTING.md`. Architecture and security model: `docs/ARCHITECTURE.md`. Hosting: `docs/DEPLOYMENT.md`. Telegram and WhatsApp: `docs/INTEGRATIONS.md`.

## Honest limits

- **Not end-to-end encrypted.** Files are private and encrypted at rest by the storage provider, but the server must read text to search it. In *Cloud AI* mode the AI provider sees the passages it is sent. The UI says this wherever it matters.
- **WhatsApp**: import only. Names and times come from the export and are labelled "unverified".
- **Results link to the copy saved here.** There are no deep links into WhatsApp or Telegram.
- AI answers can be wrong; every answer lists its sources so you can check.
