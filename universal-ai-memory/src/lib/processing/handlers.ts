import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { processImportJob } from "@/lib/imports/runner";
import { ingestTelegramAttachment } from "@/lib/telegram/bot";
import { embedPendingFor } from "./index-writer";
import { runJobs, type JobHandlers, type RunOptions } from "./jobs";
import { processLink } from "./links";
import { markFileFailed, processFile } from "./pipeline";

export function buildHandlers(admin: SupabaseClient): JobHandlers {
  return {
    process_file: async (job) => {
      const r = await processFile(admin, String(job.payload.fileId));
      return { status: r.status };
    },
    process_link: async (job) => {
      await processLink(admin, String(job.payload.linkId));
    },
    process_import: (job) => processImportJob(admin, job),
    embed_pending: async (job) => {
      const r = await embedPendingFor(admin, job.owner_id);
      return r;
    },
    telegram_ingest: (job) => ingestTelegramAttachment(admin, job),
    onFinalFailure: async (job, message) => {
      if (job.kind === "process_file") await markFileFailed(admin, String(job.payload.fileId), message);
      if (job.kind === "process_link") {
        await admin.from("links").update({ status: "failed", status_detail: `Processing failed: ${message}` }).eq("id", String(job.payload.linkId));
      }
      if (job.kind === "process_import" && job.payload.batchId) {
        await admin
          .from("import_batches")
          .update({ status: "failed", error: `Import failed: ${message}`, completed_at: new Date().toISOString() })
          .eq("id", String(job.payload.batchId))
          .in("status", ["pending", "processing"]);
      }
    },
  };
}

/** Runs pending background work. Used by the cron route, the post-upload kick and the standalone worker. */
export async function processPendingJobs(admin: SupabaseClient, opts: RunOptions) {
  return runJobs(admin, buildHandlers(admin), opts);
}
