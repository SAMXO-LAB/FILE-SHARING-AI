import "server-only";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminConfigured } from "@/lib/env";
import { errors } from "@/lib/api";
import { withAiDeadline } from "@/lib/ai/provider";
import { processPendingJobs } from "@/lib/processing/handlers";
import { createAdminClient } from "@/lib/supabase/admin";

/** Service-role client, or a clear 503 when the server isn't configured for background work. */
export function adminOrThrow(): SupabaseClient {
  if (!adminConfigured()) {
    throw errors.notConfigured("The server is missing SUPABASE_SECRET_KEY, which is required for uploads and background processing.");
  }
  return createAdminClient();
}

/**
 * Starts working on queued jobs right after the response is sent, so users don't have to wait for
 * a cron tick. Work is persisted in the queue: if this process dies, a worker or the cron route
 * picks the jobs up. No request depends on this finishing.
 */
export function kickJobs(budgetMs = 25_000) {
  if (!adminConfigured()) return;
  after(async () => {
    try {
      // AI calls inside jobs share the same budget so the background run finishes before the platform limit.
      await withAiDeadline(budgetMs + 10_000, () => processPendingJobs(createAdminClient(), { workerId: `inline-${crypto.randomUUID().slice(0, 6)}`, budgetMs, limit: 3 }));
    } catch (e) {
      console.error("[jobs] inline run failed:", (e as Error).message.slice(0, 200));
    }
  });
}

export async function audit(
  userId: string | null,
  event: string,
  target?: { type?: string; id?: string },
  metadata: Record<string, unknown> = {},
) {
  if (!adminConfigured()) return;
  try {
    await createAdminClient().rpc("write_audit", {
      p_user: userId,
      p_event: event,
      p_target_type: target?.type ?? null,
      p_target_id: target?.id ?? null,
      p_metadata: metadata,
    });
  } catch {
    /* auditing must not break the user's action */
  }
}

/** Re-indexes a note after the response is sent (the note itself is saved first). */
export function indexNoteLater(noteId: string) {
  if (!adminConfigured()) return;
  after(async () => {
    try {
      const { indexNote } = await import("@/lib/processing/links");
      await indexNote(createAdminClient(), noteId);
    } catch (e) {
      console.error("[notes] indexing failed:", (e as Error).message.slice(0, 200));
    }
  });
}
