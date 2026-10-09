import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobRow } from "@/lib/types";

export type JobKind = JobRow["kind"];

export async function enqueueJob(
  admin: SupabaseClient,
  ownerId: string,
  kind: JobKind,
  payload: Record<string, unknown>,
  opts: { dedupeKey?: string; delaySeconds?: number; maxAttempts?: number } = {},
): Promise<string> {
  const { data, error } = await admin.rpc("enqueue_job", {
    p_owner: ownerId,
    p_kind: kind,
    p_payload: payload,
    p_dedupe_key: opts.dedupeKey ?? null,
    p_run_after: new Date(Date.now() + (opts.delaySeconds ?? 0) * 1000).toISOString(),
    p_max_attempts: opts.maxAttempts ?? 3,
  });
  if (error) throw new Error(`Could not queue background work (${error.message}).`);
  return data as string;
}

/** Thrown by handlers for failures worth retrying later (provider outage, rate limit). */
export class RetryableError extends Error {
  constructor(message: string, public delaySeconds = 60) {
    super(message);
  }
}

export interface JobHandlers {
  process_file: (job: JobRow) => Promise<Record<string, unknown> | void>;
  process_link: (job: JobRow) => Promise<Record<string, unknown> | void>;
  process_import: (job: JobRow) => Promise<Record<string, unknown> | void>;
  embed_pending: (job: JobRow) => Promise<Record<string, unknown> | void>;
  telegram_ingest: (job: JobRow) => Promise<Record<string, unknown> | void>;
  /** Called when a job exhausts its attempts so the owning record can show "Processing failed". */
  onFinalFailure?: (job: JobRow, message: string) => Promise<void>;
}

export interface RunOptions {
  workerId: string;
  limit?: number;
  /** Stop claiming new jobs after this much time (serverless time budgets). */
  budgetMs?: number;
  kinds?: JobKind[];
}

export interface RunSummary {
  claimed: number;
  succeeded: number;
  failed: number;
  retried: number;
}

/** Claims and executes queued jobs. Safe to run from many workers concurrently (SKIP LOCKED). */
export async function runJobs(admin: SupabaseClient, handlers: JobHandlers, opts: RunOptions): Promise<RunSummary> {
  const started = Date.now();
  const budget = opts.budgetMs ?? 45_000;
  const summary: RunSummary = { claimed: 0, succeeded: 0, failed: 0, retried: 0 };

  while (Date.now() - started < budget) {
    const { data, error } = await admin.rpc("claim_jobs", {
      p_worker: opts.workerId,
      p_limit: Math.min(opts.limit ?? 3, 10),
      p_kinds: opts.kinds ?? null,
    });
    if (error) throw new Error(`Could not claim jobs (${error.message}).`);
    const jobs = (data ?? []) as JobRow[];
    if (jobs.length === 0) break;
    summary.claimed += jobs.length;

    for (const job of jobs) {
      try {
        const result = (await handlers[job.kind](job)) ?? {};
        await admin.from("processing_jobs").update({ status: "succeeded", result, last_error: null, locked_at: null, locked_by: null }).eq("id", job.id);
        summary.succeeded++;
      } catch (err) {
        const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
        const retryable = err instanceof RetryableError || !(err instanceof Error && err.name === "PermanentJobError");
        if (retryable && job.attempts < job.max_attempts) {
          const delay = err instanceof RetryableError ? err.delaySeconds : Math.min(30 * 2 ** (job.attempts - 1), 900);
          await admin
            .from("processing_jobs")
            .update({ status: "queued", last_error: message, run_after: new Date(Date.now() + delay * 1000).toISOString(), locked_at: null, locked_by: null })
            .eq("id", job.id);
          summary.retried++;
        } else {
          await admin.from("processing_jobs").update({ status: "failed", last_error: message, locked_at: null, locked_by: null }).eq("id", job.id);
          summary.failed++;
          await handlers.onFinalFailure?.(job, message).catch(() => {});
        }
      }
    }
  }
  return summary;
}

/** Marks a failure as not worth retrying (bad input, unsupported content). */
export class PermanentJobError extends Error {
  override name = "PermanentJobError";
}
