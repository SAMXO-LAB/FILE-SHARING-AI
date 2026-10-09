# Deployment

The app is a standard Next.js server plus a Supabase project. Any host that runs Node 20.9+ works (Vercel, a container on Fly/Render/Railway, a VM). Pick **one** of the two ways to run background jobs.

## 1. Supabase project

1. Create a project (or self-host). Apply the migrations: `supabase link --project-ref <ref> && supabase db push`.
2. **Auth → Providers → Email**: turn **Confirm email** on (the local `config.toml` has it off for convenience). Set a minimum password length of 10.
3. **Auth → URL configuration**: set the Site URL to your public address and add `https://your-domain/auth/callback` to the redirect URLs. Signup and password-reset emails link there.
4. **Storage**: the migration creates the private `memory-files` bucket. Resumable uploads are on by default; raise the global file size limit (Storage settings) to at least your `MAX_UPLOAD_BYTES` (the local config uses 2 GiB; hosted plans have lower caps, so set `MAX_UPLOAD_BYTES` to match).
5. **Extensions**: `vector`, `pg_trgm`, `unaccent` (the first migration enables them).
6. Consider SMTP of your own for auth emails; the built-in sender is rate-limited.

## 2. App environment

Copy `.env.example` and set the variables on your host. Required: the three Supabase values, `NEXT_PUBLIC_APP_URL` (your public HTTPS URL), and `CRON_SECRET` if you use scheduled jobs. The service-role key must never be exposed to the browser; only `NEXT_PUBLIC_*` variables are.

```bash
npm ci
npm run build
npm run start      # PORT=3000 by default
```

## 3. Background jobs: choose one

**Worker (long-lived server or container).** Run `npm run worker` as a second process. It claims jobs from the database queue, retries with backoff, and does housekeeping every 10 minutes. You can run several; the queue uses `FOR UPDATE SKIP LOCKED`.

**Scheduled HTTP (serverless).** Call the cron route every minute:

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/jobs/run
```

On Vercel add a cron entry in `vercel.json` (`{"crons":[{"path":"/api/jobs/run","schedule":"* * * * *"}]}`; Vercel sends the `CRON_SECRET` environment variable as a bearer token automatically). Each call processes jobs for up to ~45 s and runs maintenance (trash purge after 30 days, abandoned upload cleanup, expired Telegram link codes, old job rows). Add `?maintenance=0` to skip housekeeping.

Even without either, uploads trigger an inline run right after the response, so a small single-user setup keeps working; but those runs end if the process is stopped, which is why a worker or cron is recommended.

## 4. Telegram (optional)

See `docs/INTEGRATIONS.md`. Set the three `TELEGRAM_*` variables, deploy, then run `npm run telegram:webhook -- https://your-domain` once.

## 5. Hardening checklist

- [ ] HTTPS only; HSTS is already sent by the app.
- [ ] Email confirmation on; strong SMTP sender.
- [ ] `SUPABASE_SECRET_KEY` and `CRON_SECRET` only in server environment variables.
- [ ] `MAX_UPLOAD_BYTES` and `DEFAULT_QUOTA_BYTES` set for your storage plan.
- [ ] ClamAV reachable (`CLAMAV_HOST`) if you accept files from many people. Without it, uploads are checked by type and executable blocking only.
- [ ] If you use an AI provider, read its data-handling terms; in *Cloud AI* mode users' retrieved passages are sent to it.
- [ ] Backups of the Supabase database and the `memory-files` bucket.
- [ ] Review Auth rate limits in the Supabase dashboard (the app adds its own limits on its routes).

## 6. Upgrading

Migrations are append-only files in `supabase/migrations`. Apply new ones with `supabase db push` before deploying the matching app version.

## 7. Sign in with Google (optional)

The login and sign-up pages show **Continue with Google** automatically once Google is enabled in Supabase (the app reads Supabase's public auth settings, so no app variable is needed).

1. **Google Cloud Console** → APIs & Services → **OAuth consent screen**: choose *External*, fill in the app name and your email. While the app is in *Testing*, add the Google accounts that may sign in under *Test users*.
2. **Credentials → Create credentials → OAuth client ID** → *Web application*.
   - Authorized JavaScript origins: your site, e.g. `https://your-app.vercel.app`
   - Authorized redirect URIs: `https://<project-ref>.supabase.co/auth/v1/callback` (shown on the Google provider page in Supabase)
3. **Supabase → Authentication → Sign In / Providers → Google**: turn it on, paste the Client ID and Client Secret, save.
4. **Supabase → Authentication → URL Configuration**: the Site URL is your site, and Redirect URLs include `https://your-app.vercel.app/auth/callback` (add `https://*-<your-vercel-team>.vercel.app/auth/callback` to make preview deployments work too).
5. Apply migration `0009_oauth_profiles.sql`. New Google accounts then get a username from their email (e.g. `jane_doe`) and their Google name as display name; they can change the username once in Settings → Account.

Google sign-in doesn't send any email from Supabase, so it isn't affected by the built-in email rate limit.
