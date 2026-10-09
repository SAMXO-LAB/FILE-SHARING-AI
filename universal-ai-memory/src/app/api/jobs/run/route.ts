import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { adminConfigured, cronSecret } from "@/lib/env";
import { withAiDeadline } from "@/lib/ai/provider";
import { processPendingJobs } from "@/lib/processing/handlers";
import { runMaintenance } from "@/lib/processing/maintenance";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = cronSecret();
  const header = req.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function run(req: NextRequest) {
  if (!cronSecret()) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!adminConfigured()) return NextResponse.json({ error: "Server is missing SUPABASE_SECRET_KEY." }, { status: 503 });
  const admin = createAdminClient();
  const summary = await withAiDeadline(52_000, () => processPendingJobs(admin, { workerId: `cron-${crypto.randomUUID().slice(0, 6)}`, budgetMs: 45_000, limit: 5 }));
  const maintenance = req.nextUrl.searchParams.get("maintenance") === "0" ? null : await runMaintenance(admin).catch((e) => ({ error: String(e.message).slice(0, 120) }));
  return NextResponse.json({ ok: true, jobs: summary, maintenance }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = run;
export const POST = run;
