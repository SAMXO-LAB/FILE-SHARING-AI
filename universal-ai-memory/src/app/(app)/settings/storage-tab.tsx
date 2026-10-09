"use client";
import Link from "next/link";
import { Skeleton, Progress, ErrorState } from "@/components/ui/misc";
import { useFetch } from "@/lib/client/api";
import { humanSize } from "@/lib/files/types";
import { Section } from "./parts";

interface Storage { usedBytes: number; trashBytes: number; quotaBytes: number; maxUploadBytes: number; byCategory: Record<string, number> }
const LABEL: Record<string, string> = { document: "Documents", image: "Images", video: "Videos", audio: "Audio", archive: "Archives", code: "Code", data: "Data", other: "Other", import: "Chat export files (removed after import)" };

export function StorageTab() {
  const q = useFetch<Storage>("/api/storage");
  if (q.loading) return <Skeleton className="h-48" />;
  if (q.error || !q.data) return <ErrorState message={q.error ?? "Couldn't load storage."} onRetry={q.reload} />;
  const d = q.data;
  const pct = d.quotaBytes > 0 ? Math.min(100, (d.usedBytes / d.quotaBytes) * 100) : 0;
  const rows = Object.entries(d.byCategory).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const max = rows[0]?.[1] ?? 1;
  return (
    <div className="space-y-5">
      <Section title="Storage used" description="Counts every file you've stored, including items in the trash until they're deleted for good.">
        <div>
          <p className="text-2xl font-semibold">{humanSize(d.usedBytes)} <span className="text-sm font-normal text-muted">of {humanSize(d.quotaBytes)}</span></p>
          <div role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Storage used" className="mt-3"><Progress value={pct} /></div>
          {pct >= 90 && <p className="mt-2 text-sm text-warn">You're almost out of space. Delete files you no longer need{d.trashBytes > 0 ? ", starting with the trash" : ""}.</p>}
        </div>
        <p className="text-sm text-muted">Largest single file: {humanSize(d.maxUploadBytes)}.</p>
      </Section>
      <Section title="What's using it">
        {rows.length === 0 ? <p className="text-sm text-muted">No files yet.</p> : (
          <ul className="space-y-3">
            {rows.map(([k, n]) => (
              <li key={k}>
                <div className="mb-1 flex justify-between text-sm"><span>{LABEL[k] ?? k}</span><span className="text-muted">{humanSize(n)}</span></div>
                <Progress value={(n / max) * 100} />
              </li>
            ))}
          </ul>
        )}
        {d.trashBytes > 0 && <p className="text-sm text-muted">{humanSize(d.trashBytes)} is in the trash. <Link href="/files?view=trash" className="text-accent underline">Open trash</Link></p>}
      </Section>
    </div>
  );
}
