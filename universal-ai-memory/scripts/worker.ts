/**
 * Standalone background worker. Use it instead of (or alongside) the cron route when you run the
 * app on a long-lived server or container:
 *
 *   npm run worker
 *
 * It claims jobs from the persistent queue (safe to run several copies), and runs housekeeping
 * (trash purge, abandoned uploads, expired link codes) every 10 minutes.
 */
import crypto from "node:crypto";
import { loadEnv } from "./load-env";

loadEnv();

const { adminConfigured } = await import("@/lib/env");
const { createAdminClient } = await import("@/lib/supabase/admin");
const { processPendingJobs } = await import("@/lib/processing/handlers");
const { runMaintenance } = await import("@/lib/processing/maintenance");

if (!adminConfigured()) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or SUPABASE_SECRET_KEY. Check .env.local.");
  process.exit(1);
}

const admin = createAdminClient();
const workerId = `worker-${crypto.randomUUID().slice(0, 6)}`;
const IDLE_MS = Number(process.env.WORKER_IDLE_MS ?? 3000);
const MAINTENANCE_MS = 10 * 60_000;
let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { console.log(`[${workerId}] ${sig}: finishing the current batch, then stopping.`); stopping = true; });

console.log(`[${workerId}] started`);
let lastMaintenance = 0;
while (!stopping) {
  try {
    const r = await processPendingJobs(admin, { workerId, budgetMs: 30_000, limit: 5 });
    if (r.claimed > 0) console.log(`[${workerId}] claimed ${r.claimed}: ${r.succeeded} ok, ${r.retried} retry, ${r.failed} failed`);
    if (Date.now() - lastMaintenance > MAINTENANCE_MS) {
      lastMaintenance = Date.now();
      const m = await runMaintenance(admin);
      if (Object.values(m).some((n) => n > 0)) console.log(`[${workerId}] maintenance`, m);
    }
    if (r.claimed === 0) await new Promise((res) => setTimeout(res, IDLE_MS));
  } catch (e) {
    console.error(`[${workerId}] loop error:`, (e as Error).message.slice(0, 300));
    await new Promise((res) => setTimeout(res, 10_000));
  }
}
console.log(`[${workerId}] stopped`);
