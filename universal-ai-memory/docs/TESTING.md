# Testing

| Layer | Command | What it covers | Needs |
| --- | --- | --- | --- |
| Types / lint | `npm run typecheck`, `npm run lint` | strict TS, React Compiler lint rules | — |
| Unit | `npm run test:unit` | WhatsApp (Android/iOS) and Telegram parsers, chunking, extraction, SSRF guard, MIME sniffing, origin check, rate limiter, prompt fencing, question interpretation, tags/LIKE escaping, URL-line parsing, theme mapping and validation | — |
| Database | `npm run db:test:up` then `npm run test:db` | RLS isolation between users, column grants, quota races, job-queue concurrency (`claim_jobs`), storage insert policy, sharing rules, username rules, hybrid search | local Postgres 15+ with pgvector |
| Browser smoke | `npm run build && npm run test:smoke` | every page renders in headless Chromium, sign-in works, theme switching, Add dialog, no console/CSP errors, no horizontal scroll on a phone-size viewport | Playwright + Chromium |

`npm test` runs the unit and database projects.

## Database tests

They create a throwaway database from a template built from `supabase/migrations`, with small stubs for Supabase's `auth` and `storage` schemas and roles (`tests/db/setup`). Start Postgres with `scripts/test-db.sh up` (it uses `PGBIN`, defaulting to the newest `/usr/lib/postgresql/*/bin`) or set `TEST_DATABASE_URL`. These tests check the SQL and policies that the app depends on; they do not run Supabase itself.

## Browser smoke test

`tests/smoke/mock-supabase.mjs` is a tiny HTTP stand-in that answers the sign-in calls and returns a fixed profile and preferences; every other table is empty. The test therefore shows each page in its real **empty** state. It cannot catch problems that depend on real data, storage, search or imports. Those paths are covered by the database and unit tests, and by trying the app against a real Supabase project (see below).

## What has not been automated

A full end-to-end run against a real Supabase stack (upload a PDF → processing → ask → cited answer), real provider calls (OpenAI/Anthropic/Telegram), ClamAV, and large-file/mobile-device behaviour. Before relying on a deployment, do this manual pass:

1. Sign up, confirm the email (enable confirmations in production), sign in.
2. Upload a text PDF and a Word file; wait for **Ready**; ask a question about each and open the cited source.
3. Drop a link and a pasted note; search for words from them.
4. Import a WhatsApp export; open the chat from a result and check the highlighted message.
5. Share a file with a second account; accept, view, revoke, and confirm access stops.
6. Switch to *Metadata only* and confirm no AI call is made and answers become passage lists.
7. Delete the account and confirm the storage objects are gone.
