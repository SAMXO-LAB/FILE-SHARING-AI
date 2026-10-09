"use client";
import Link from "next/link";
import { formatDate, formatDateTime } from "@/lib/utils";
import { TypeIcon } from "./file-visuals";

export interface TimelineItem {
  type: "file" | "link" | "note" | "conversation";
  id: string; title: string; at: string; atKind: string; detail: string | null; category: string | null; mime: string | null; sourceId: string;
}

export const itemHref = (i: Pick<TimelineItem, "type" | "id">) =>
  i.type === "file" ? `/files?open=${i.id}` : i.type === "link" ? `/links?open=${i.id}` : i.type === "note" ? `/documents?note=${i.id}` : `/conversations/${i.id}`;

const VERB: Record<string, string> = { uploaded: "Uploaded", saved: "Saved", created: "Created", imported: "Imported" };

function dayKey(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 86400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return formatDate(iso, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function TimelineList({ items, grouped = true }: { items: TimelineItem[]; grouped?: boolean }) {
  const groups: { label: string; items: TimelineItem[] }[] = [];
  for (const it of items) {
    const label = grouped ? dayKey(it.at) : "";
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(it);
    else groups.push({ label, items: [it] });
  }
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.label || "all"}>
          {g.label && <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{g.label}</h3>}
          <ul className="space-y-1.5">
            {g.items.map((it) => (
              <li key={`${it.type}:${it.id}`}>
                <Link href={itemHref(it)} className="panel flex items-center gap-3 p-3 transition-colors hover:bg-[rgb(var(--line)/0.08)]">
                  <TypeIcon type={it.type} category={it.category} mime={it.mime} className="h-9 w-9" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{it.title}</p>
                    <p className="truncate text-xs text-muted">{VERB[it.atKind] ?? "Added"} {formatDateTime(it.at)}{it.detail ? ` · ${it.detail}` : ""}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
