"use client";
import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Copy, FileText, Loader2, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/misc";
import { humanSize } from "@/lib/files/types";
import { cn } from "@/lib/utils";
import { useUploads, type UploadItem } from "./upload-context";

const LABEL: Record<UploadItem["status"], string> = {
  hashing: "Checking for duplicates…", queued: "Waiting…", uploading: "Uploading", finalizing: "Verifying…", processing: "Reading and indexing…",
  done: "Added to memory", duplicate: "Already in your memory", failed: "Failed", cancelled: "Cancelled",
};

export function UploadRow({ it }: { it: UploadItem }) {
  const { cancel, retry, dismiss } = useUploads();
  const busy = ["hashing", "queued", "uploading", "finalizing"].includes(it.status);
  return (
    <li className="flex gap-3 px-4 py-3">
      <div className="mt-0.5 shrink-0">
        {it.status === "done" ? <CheckCircle2 className="h-5 w-5 text-ok" aria-hidden />
          : it.status === "failed" ? <AlertTriangle className="h-5 w-5 text-danger" aria-hidden />
          : it.status === "duplicate" ? <Copy className="h-5 w-5 text-warn" aria-hidden />
          : it.status === "cancelled" ? <X className="h-5 w-5 text-muted" aria-hidden />
          : it.status === "processing" ? <Loader2 className="h-5 w-5 animate-spin text-accent" aria-hidden />
          : <FileText className="h-5 w-5 text-muted" aria-hidden />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={it.name}>{it.name}</p>
        <p className={cn("text-xs", it.status === "failed" ? "text-danger" : "text-muted")}>
          {it.status === "failed" ? it.error : it.status === "duplicate" ? `Same content as “${it.duplicateOf?.name}”.` : `${LABEL[it.status]}${it.status === "uploading" ? ` · ${Math.round(it.progress)}% of ${humanSize(it.size)}` : ""}`}
          {it.status === "done" && it.detail ? ` — ${it.detail}` : ""}
        </p>
        {(it.status === "uploading" || it.status === "finalizing") && <Progress value={it.progress} className="mt-2" />}
        {it.status === "duplicate" && (
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="glass" onClick={() => retry(it.id, { allowDuplicate: true })}>Upload anyway</Button>
            <Button size="sm" variant="ghost" onClick={() => dismiss(it.id)}>Skip</Button>
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-start gap-1">
        {busy && <Button size="icon-sm" variant="ghost" aria-label={`Cancel ${it.name}`} onClick={() => cancel(it.id)}><X className="h-4 w-4" /></Button>}
        {(it.status === "failed" || it.status === "cancelled") && <Button size="icon-sm" variant="ghost" aria-label={`Retry ${it.name}`} onClick={() => retry(it.id)}><RotateCcw className="h-4 w-4" /></Button>}
        {["done", "failed", "cancelled"].includes(it.status) && <Button size="icon-sm" variant="ghost" aria-label={`Dismiss ${it.name}`} onClick={() => dismiss(it.id)}><X className="h-4 w-4" /></Button>}
      </div>
    </li>
  );
}

export function UploadTray() {
  const { items, activeCount, clearFinished } = useUploads();
  const [open, setOpen] = useState(true);
  if (items.length === 0) return null;
  const done = items.filter((i) => ["done", "cancelled", "duplicate"].includes(i.status)).length;
  const failed = items.filter((i) => i.status === "failed").length;
  const title = activeCount > 0 ? `Uploading ${activeCount} file${activeCount === 1 ? "" : "s"}` : failed ? `${failed} upload${failed === 1 ? "" : "s"} failed` : "Uploads complete";
  return (
    <section aria-label="Uploads" className="glass-float animate-rise fixed bottom-4 right-4 z-40 w-[min(24rem,calc(100vw-2rem))] overflow-hidden" style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
      <header className="flex items-center gap-2 px-4 py-3">
        <h2 className="flex-1 text-[13.5px] font-semibold" aria-live="polite">{title}</h2>
        {done > 0 && <button onClick={clearFinished} className="text-xs text-muted hover:text-fg">Clear finished</button>}
        <Button size="icon-sm" variant="ghost" aria-label={open ? "Collapse uploads" : "Expand uploads"} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </Button>
      </header>
      {open && (
        <>
          <ul className="max-h-72 divide-y divide-[rgb(var(--line)/0.07)] overflow-y-auto border-t hairline">{items.map((it) => <UploadRow key={it.id} it={it} />)}</ul>
          <div className="border-t hairline px-4 py-2 text-right"><Link href="/uploads" className="text-xs text-accent hover:underline">Open Uploads</Link></div>
        </>
      )}
    </section>
  );
}
