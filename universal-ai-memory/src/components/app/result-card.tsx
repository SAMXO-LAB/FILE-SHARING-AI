"use client";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
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
  return (
    <article className="glass group relative flex flex-col gap-3 p-4 transition-transform hover:-translate-y-0.5">
      <div className="flex items-start gap-3">
        <TypeIcon type={card.type} category={card.category} mime={card.mime} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">
            <Link href={cardHref(card)} className="after:absolute after:inset-0 after:content-[''] focus-visible:after:rounded-[var(--radius)]">{card.title}</Link>
          </h3>
          <p className="mt-0.5 truncate text-xs text-muted">
            {card.typeLabel} · {card.sourceLabel}
            {card.sizeBytes != null && ` · ${humanSize(card.sizeBytes)}`}
            {card.messageCount != null && ` · ${card.messageCount} messages`}
          </p>
        </div>
        <StatusBadge status={card.status} detail={card.statusDetail} />
      </div>
      {!compact && card.passages[0] && (
        <p className="line-clamp-3 rounded-lg bg-[rgb(var(--line)/0.07)] px-3 py-2 text-[13px] leading-relaxed text-muted">
          {card.passages[0].page != null && <span className="mr-1.5 font-medium text-fg">p. {card.passages[0].page}</span>}
          {card.passages[0].text}
        </p>
      )}
      {!compact && !card.passages[0] && card.description && <p className="line-clamp-2 text-[13px] text-muted">{card.description}</p>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        {date && <span>{dateLabel} {date}</span>}
        {card.sender && <span title="Name copied from the export. It isn't a verified identity.">From “{card.sender}” <span className="opacity-70">(unverified)</span></span>}
        {card.url && <span className="relative z-10 inline-flex items-center gap-1 truncate"><ExternalLink className="h-3 w-3" aria-hidden /><span className="truncate">{hostOf(card.url)}</span></span>}
        {card.relevanceLabel === "high" && <Badge tone="accent">Best match</Badge>}
      </div>
    </article>
  );
}
