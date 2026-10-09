import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { purgeFiles } from "./pipeline";

export const TRASH_RETENTION_DAYS = 30;

/**
 * Periodic housekeeping (called by the cron route / worker):
 *  - permanently delete files that have been in the trash past the retention period
 *  - drop upload reservations that never completed (and any partial objects)
 *  - remove expired Telegram link codes and old finished jobs
 */
export async function runMaintenance(admin: SupabaseClient): Promise<Record<string, number>> {
  const out = { purgedFiles: 0, abandonedUploads: 0, staleImportSources: 0, expiredCodes: 0, oldJobs: 0 };

  const trashCutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 86400_000).toISOString();
  const { data: trashed } = await admin.from("files").select("id,owner_id").lt("deleted_at", trashCutoff).limit(200);
  const byOwner = new Map<string, string[]>();
  for (const f of (trashed ?? []) as { id: string; owner_id: string }[]) {
    byOwner.set(f.owner_id, [...(byOwner.get(f.owner_id) ?? []), f.id]);
  }
  for (const [owner, ids] of byOwner) out.purgedFiles += await purgeFiles(admin, owner, ids);

  const abandonedCutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: stale } = await admin.from("files").select("id,owner_id").eq("status", "uploading").lt("created_at", abandonedCutoff).limit(200);
  const staleByOwner = new Map<string, string[]>();
  for (const f of (stale ?? []) as { id: string; owner_id: string }[]) {
    staleByOwner.set(f.owner_id, [...(staleByOwner.get(f.owner_id) ?? []), f.id]);
  }
  for (const [owner, ids] of staleByOwner) {
    try {
      out.abandonedUploads += await purgeFiles(admin, owner, ids);
    } catch {
      /* partial objects may not exist; rows are removed on the next pass */
    }
  }

  // Chat exports left behind by failed or abandoned imports are removed after a week.
  const { data: leftovers } = await admin
    .from("files").select("id,owner_id").eq("purpose", "import_source").lt("created_at", new Date(Date.now() - 7 * 86400_000).toISOString()).limit(200);
  const leftByOwner = new Map<string, string[]>();
  for (const f of (leftovers ?? []) as { id: string; owner_id: string }[]) {
    leftByOwner.set(f.owner_id, [...(leftByOwner.get(f.owner_id) ?? []), f.id]);
  }
  for (const [owner, ids] of leftByOwner) {
    try {
      out.staleImportSources += await purgeFiles(admin, owner, ids);
    } catch {
      /* retried on the next pass */
    }
  }

  const { count: codes } = await admin.from("telegram_link_codes").delete({ count: "exact" }).lt("expires_at", new Date().toISOString());
  out.expiredCodes = codes ?? 0;
  const { count: jobs } = await admin
    .from("processing_jobs")
    .delete({ count: "exact" })
    .in("status", ["succeeded", "cancelled"])
    .lt("updated_at", new Date(Date.now() - 7 * 86400_000).toISOString());
  out.oldJobs = jobs ?? 0;
  return out;
}
