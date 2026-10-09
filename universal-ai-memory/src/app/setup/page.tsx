import type { Metadata } from "next";
import { CheckCircle2, Circle } from "lucide-react";
import { Logo } from "@/components/app/auth-shell";
import { capabilities } from "@/lib/env";

export const metadata: Metadata = { title: "Setup" };
export const dynamic = "force-dynamic";

export default function SetupPage() {
  const caps = capabilities();
  const steps: { done: boolean; title: string; body: string; required: boolean }[] = [
    { done: caps.supabase, required: true, title: "Connect Supabase", body: "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, then apply the migrations in supabase/migrations (supabase db push)." },
    { done: caps.admin, required: true, title: "Add the server key", body: "Set SUPABASE_SECRET_KEY. It stays on the server and powers uploads, the job queue and account deletion." },
    { done: caps.ai, required: false, title: "Choose an AI provider (optional)", body: "Set AI_PROVIDER, AI_API_KEY and AI_MODEL. Without it you still get search and matching passages, but no written answers." },
    { done: caps.embeddings, required: false, title: "Enable semantic search (optional)", body: "Set EMBEDDING_* variables (any OpenAI-compatible embeddings endpoint). Without it search uses keywords and metadata." },
    { done: caps.cron, required: false, title: "Background worker (recommended)", body: "Set CRON_SECRET and schedule GET /api/jobs/run every minute, or run `npm run worker` as a long-lived process." },
    { done: caps.telegram, required: false, title: "Telegram bot (optional)", body: "Set TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME and TELEGRAM_WEBHOOK_SECRET, then run scripts/set-telegram-webhook.ts." },
    { done: caps.malwareScan, required: false, title: "Malware scanning (optional)", body: "Set CLAMAV_HOST (and CLAMAV_PORT) to scan every upload with ClamAV. Without it uploads are verified by type only." },
  ];
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Logo className="text-lg" />
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">Finish setting up</h1>
      <p className="mt-2 text-sm text-muted">This page shows which parts of the server are configured. It never displays secret values. Copy <code>.env.example</code> to <code>.env.local</code>, fill it in, and restart.</p>
      <ul className="mt-6 space-y-3">
        {steps.map((s) => (
          <li key={s.title} className="glass flex gap-3 p-4">
            {s.done ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-ok" aria-label="Done" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-label={s.required ? "Required, not done" : "Not done"} />}
            <div>
              <p className="font-medium">{s.title}{s.required && !s.done && <span className="ml-2 text-xs text-danger">required</span>}</p>
              <p className="mt-1 text-sm text-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ul>
      {caps.supabase && caps.admin && <p className="mt-6 text-sm"><a className="text-accent underline underline-offset-4" href="/login">Continue to sign in →</a></p>}
    </main>
  );
}
