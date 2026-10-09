"use client";
import Link from "next/link";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/misc";
import { formatDate } from "@/lib/utils";
import { humanSize } from "@/lib/files/types";
import type { ContentCard } from "@/lib/retrieval/types";
import { StatusBadge, TypeIcon } from "./file-visuals";

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url.slice(0, 40); }
}

export function cardHref(c: Pick<ContentCard, "type" | "id" | "passages">): string {
  switch (c.type) {
    case "file": return `/files?open=${c.id}`;
    case "link": return `/links?open=${c.id}`;
    case "note": return `/documents?note=${c.id}`;
    case "conversation": {
      const seq = c.passages[0]?.seqFrom;
      return `/conversations/${c.id}${seq ? `?seq=${seq}` : ""}`;
    }
  }
}

/** A real item from the user's memory (built by the backend, never by the AI). */
export function ResultCard({ card, compact = false }: { card: ContentCard; compact?: boolean }) {
  const date = card.date ? formatDate(card.date) : null;
  const dateLabel = { sent: "Sent", modified: "Modified", uploaded: "Uploaded", imported: "Imported", saved: "Saved", created: "Updated" }[card.dateKind ?? ""] ?? "";
  const meta = [card.typeLabel, card.sizeBytes != null ? humanSize(card.sizeBytes) : null, card.messageCount != null ? `${card.messageCount} messages` : null, date ? `${dateLabel} ${date}`.trim() : null].filter(Boolean).join(" · ");
  return (
    <article className="card card-hover group relative flex min-w-0 flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <TypeIcon type={card.type} category={card.category} mime={card.mime} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-medium leading-5">
            <Link href={cardHref(card)} className="after:absolute after:inset-0 after:rounded-[var(--radius)] after:content-[''] group-hover:text-accent">{card.title}</Link>
          </h3>
          <p className="mt-0.5 truncate text-xs text-muted">{meta}</p>
        </div>
        <StatusBadge status={card.status} detail={card.statusDetail} />
        <ArrowUpRight className="h-4 w-4 shrink-0 text-subtle opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100" aria-hidden />
      </div>
      {!compact && card.passages[0] && (
        <p className="line-clamp-2 rounded-[10px] bg-[rgb(var(--line)/0.03)] px-3 py-2 text-[13px] leading-relaxed text-muted">
          {card.passages[0].page != null && <span className="mr-1.5 font-medium text-fg">p. {card.passages[0].page}</span>}
          {card.passages[0].text}
        </p>
      )}
      {!compact && !card.passages[0] && card.description && <p className="line-clamp-2 text-[13px] text-muted">{card.description}</p>}
      {(card.sender || card.url || card.relevanceLabel === "high" || card.sourceId !== "upload") && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {card.sourceId !== "upload" && <span>{card.sourceLabel}</span>}
          {card.sender && <span title="Name copied from the export. It isn't a verified identity.">From “{card.sender}” <span className="text-subtle">(unverified)</span></span>}
          {card.url && <span className="relative z-10 inline-flex min-w-0 items-center gap-1"><ExternalLink className="h-3 w-3 shrink-0" aria-hidden /><span className="truncate">{hostOf(card.url)}</span></span>}
          {card.relevanceLabel === "high" && <Badge tone="accent">Best match</Badge>}
        </div>
      )}
    </article>
  );
}
