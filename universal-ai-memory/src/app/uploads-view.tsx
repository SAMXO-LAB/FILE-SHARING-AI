"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { useAddToMemory } from "@/components/app/add-dialog";
import { TypeIcon, StatusBadge } from "@/components/app/file-visuals";
import { UploadRow } from "@/components/app/upload-tray";
import { useUploads, FILES_CHANGED } from "@/components/app/upload-context";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui/misc";
import { api, errorMessage, useFetch } from "@/lib/client/api";
import { humanSize } from "@/lib/files/types";
import { timeAgo } from "@/lib/utils";

interface FileLite { id: string; display_name: string; size_bytes: number; category: string | null; status: string; status_detail: string | null; updated_at: string; indexing_level?: string | null }
interface Job { id: string; kind: string; status: string; attempts: number; max_attempts: number; last_error: string | null; created_at: string }
interface UploadsData { active: FileLite[]; problems: FileLite[]; recent: FileLite[]; jobs: Job[] }

const JOB_LABEL: Record<string, string> = { process_file: "Reading a file", process_link: "Fetching a link", process_import: "Importing a chat", embed_pending: "Building the search index", telegram_ingest: "Saving a Telegram message" };

function FileLine({ f, action }: { f: FileLite; action?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <TypeIcon category={f.category} className="h-9 w-9" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium"><Link href={`/files?open=${f.id}`} className="hover:underline">{f.display_name}</Link></p>
        <p className="truncate text-xs text-muted">{humanSize(f.size_bytes)} · {timeAgo(f.updated_at)}{f.status_detail ? ` · ${f.status_detail}` : ""}</p>
      </div>
      <StatusBadge status={f.status} detail={f.status_detail} />
      {action}
    </li>
  );
}

export function UploadsView() {
  const { openAdd } = useAddToMemory();
  const uploads = useUploads();
  const data = useFetch<UploadsData>("/api/uploads");
  const reload = data.reload;
  const [retrying, setRetrying] = useState<string | null>(null);

  useEffect(() => { const h = () => void reload(); window.addEventListener(FILES_CHANGED, h); return () => window.removeEventListener(FILES_CHANGED, h); }, [reload]);
  const pending = (data.data?.active.length ?? 0) > 0 || uploads.activeCount > 0;
  useEffect(() => { if (!pending) return; const t = setInterval(() => void reload(), 3000); return () => clearInterval(t); }, [pending, reload]);

  async function retry(f: FileLite) {
    setRetrying(f.id);
    try { await api(`/api/files/${f.id}/reprocess`, { body: {} }); toast.success("Trying again"); void reload(); } catch (e) { toast.error(errorMessage(e)); } finally { setRetrying(null); }
  }

  const d = data.data;
  // Files the browser is still sending are listed above; the server's "uploading" rows would duplicate them.
  const serverActive = (d?.active ?? []).filter((f) => f.status !== "uploading" || !uploads.items.some((i) => i.fileId === f.id));
  const failedJobs = (d?.jobs ?? []).filter((j) => j.status === "failed");
  const empty = uploads.items.length === 0 && d && serverActive.length === 0 && d.problems.length === 0 && d.recent.length === 0;

  return (
    <div>
      <PageHeader title="Uploads" description="Everything being added to your memory, what needs attention, and what finished recently." actions={<Button onClick={() => openAdd("files")}><UploadCloud className="h-4 w-4" aria-hidden />Add files</Button>} />
      {data.loading ? <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
        : data.error ? <ErrorState message={data.error} onRetry={reload} />
        : empty ? <EmptyState icon={UploadCloud} title="Nothing uploaded yet" action={<Button onClick={() => openAdd("files")}>Add files</Button>}>Drag files anywhere onto the app, or use Add to Memory. Progress, retries and problems show up here.</EmptyState>
        : (
          <div className="space-y-8">
            {uploads.items.length > 0 && (
              <section aria-labelledby="up-now"><h2 id="up-now" className="mb-2 text-sm font-semibold text-muted">From this browser</h2>
                <ul className="glass divide-y divide-[rgb(var(--line)/0.07)] overflow-hidden p-0">{uploads.items.map((it) => <UploadRow key={it.id} it={it} />)}</ul>
              </section>
            )}
            {serverActive.length > 0 && (
              <section aria-labelledby="up-proc"><h2 id="up-proc" className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Being processed</h2>
                <ul className="glass divide-y divide-[rgb(var(--line)/0.07)] overflow-hidden p-0">{serverActive.map((f) => <FileLine key={f.id} f={f} />)}</ul>
              </section>
            )}
            {d && d.problems.length > 0 && (
              <section aria-labelledby="up-prob"><h2 id="up-prob" className="mb-2 flex items-center gap-2 text-sm font-semibold text-warn"><AlertTriangle className="h-4 w-4" aria-hidden />Needs attention</h2>
                <ul className="glass divide-y divide-[rgb(var(--line)/0.07)] overflow-hidden p-0">
                  {d.problems.map((f) => (
                    <FileLine key={f.id} f={f} action={<Button size="sm" variant="glass" loading={retrying === f.id} onClick={() => void retry(f)}><RefreshCw className="h-4 w-4" aria-hidden />Try again</Button>} />
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted">“Not readable” means the file is saved but its text couldn't be extracted (for example a scanned PDF with no text, or a format we can't read). It still appears in All Files and can be searched by name.</p>
              </section>
            )}
            {failedJobs.length > 0 && (
              <section aria-labelledby="up-jobs"><h2 id="up-jobs" className="mb-2 text-sm font-semibold text-muted">Background tasks that gave up</h2>
                <ul className="glass divide-y divide-[rgb(var(--line)/0.07)] overflow-hidden p-0">
                  {failedJobs.map((j) => <li key={j.id} className="px-4 py-3 text-sm"><span className="font-medium">{JOB_LABEL[j.kind] ?? j.kind}</span><span className="text-muted"> · {timeAgo(j.created_at)} · tried {j.attempts} times</span>{j.last_error && <p className="mt-0.5 text-xs text-danger">{j.last_error}</p>}</li>)}
                </ul>
              </section>
            )}
            {d && d.recent.length > 0 && (
              <section aria-labelledby="up-recent"><h2 id="up-recent" className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted"><CheckCircle2 className="h-4 w-4 text-ok" aria-hidden />Recently added</h2>
                <ul className="glass divide-y divide-[rgb(var(--line)/0.07)] overflow-hidden p-0">{d.recent.map((f) => <FileLine key={f.id} f={f} />)}</ul>
              </section>
            )}
          </div>
        )}
    </div>
  );
}
