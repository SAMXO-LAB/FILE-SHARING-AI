"use client";
import { Check, Clock, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Skeleton } from "@/components/ui/misc";
import { api, errorMessage, useFetch } from "@/lib/client/api";
import { humanSize } from "@/lib/files/types";
import { formatDate } from "@/lib/utils";
import { Users } from "lucide-react";
import { TypeIcon } from "./file-visuals";

interface Share { id: string; status: string; canDownload: boolean; note: string | null; expiresAt: string | null; createdAt: string; file: { id: string; name: string; category: string; mime: string | null; size: number; trashed: boolean } | null; otherParty: { username: string } | null }

export function SharedWithMe({ onOpen }: { onOpen: (fileId: string) => void }) {
  const q = useFetch<{ shares: Share[] }>("/api/shares?direction=received");
  async function respond(id: string, action: "accept" | "decline") {
    try { await api(`/api/shares/${id}/respond`, { body: { action } }); toast.success(action === "accept" ? "Accepted" : "Declined"); void q.reload(); } catch (e) { toast.error(errorMessage(e)); }
  }
  async function leave(id: string) {
    try { await api(`/api/shares/${id}`, { method: "DELETE" }); toast.success("Removed"); void q.reload(); } catch (e) { toast.error(errorMessage(e)); }
  }
  if (q.loading) return <div className="space-y-2">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-16" />)}</div>;
  if (q.error) return <p role="alert" className="text-sm text-danger">{q.error}</p>;
  const shares = q.data?.shares ?? [];
  if (shares.length === 0) return <EmptyState icon={Users} title="Nothing shared with you">When someone shares a file with your username, the invitation appears here. You always decide whether to accept.</EmptyState>;
  return (
    <ul className="space-y-2">
      {shares.map((s) => (
        <li key={s.id} className="glass flex flex-wrap items-center gap-3 p-4">
          <TypeIcon category={s.file?.category} mime={s.file?.mime} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{s.file?.name ?? "File no longer available"}</p>
            <p className="text-xs text-muted">From @{s.otherParty?.username ?? "unknown"} · {s.file ? humanSize(s.file.size) : ""}{s.expiresAt ? ` · ${s.status === "expired" ? "expired" : "until"} ${formatDate(s.expiresAt)}` : ""}{!s.canDownload && " · view only"}</p>
            {s.note && <p className="mt-1 text-sm text-muted">“{s.note}”</p>}
          </div>
          {s.status === "pending" && <div className="flex gap-2"><Button size="sm" onClick={() => void respond(s.id, "accept")}><Check className="h-4 w-4" aria-hidden />Accept</Button><Button size="sm" variant="ghost" onClick={() => void respond(s.id, "decline")}><X className="h-4 w-4" aria-hidden />Decline</Button></div>}
          {s.status === "accepted" && s.file && !s.file.trashed && <div className="flex gap-2"><Button size="sm" variant="glass" onClick={() => onOpen(s.file!.id)}>Open</Button><Button size="sm" variant="ghost" onClick={() => void leave(s.id)}>Remove</Button></div>}
          {["declined", "revoked", "expired"].includes(s.status) && <Badge tone="neutral"><Clock className="h-3 w-3" aria-hidden />{s.status === "revoked" ? "Access revoked" : s.status === "expired" ? "Expired" : "Declined"}</Badge>}
        </li>
      ))}
    </ul>
  );
}
