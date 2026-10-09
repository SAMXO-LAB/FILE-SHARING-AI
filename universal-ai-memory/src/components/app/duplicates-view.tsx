"use client";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDialogs } from "@/components/ui/confirm";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { api, errorMessage, useFetch } from "@/lib/client/api";
import { humanSize } from "@/lib/files/types";
import { formatDate } from "@/lib/utils";

interface Group { hash: string; files: { id: string; display_name: string; size_bytes: number; created_at: string }[] }

export function DuplicatesView({ onOpen, onChanged }: { onOpen: (id: string) => void; onChanged: () => void }) {
  const q = useFetch<{ groups: Group[]; reclaimableBytes: number }>("/api/files/duplicates");
  const { confirm } = useDialogs();
  async function trashExtras(g: Group) {
    const extras = g.files.slice(1);
    if (!(await confirm({ title: `Move ${extras.length} extra cop${extras.length === 1 ? "y" : "ies"} to trash?`, description: `Keeps the oldest copy “${g.files[0]!.display_name}”.`, confirmLabel: "Move to trash", danger: true }))) return;
    try { await api("/api/files/bulk", { body: { ids: extras.map((f) => f.id), action: "trash" } }); toast.success("Moved to trash"); void q.reload(); onChanged(); } catch (e) { toast.error(errorMessage(e)); }
  }
  if (q.loading) return <Skeleton className="h-32" />;
  if (q.error) return <p role="alert" className="text-sm text-danger">{q.error}</p>;
  const groups = q.data?.groups ?? [];
  if (groups.length === 0) return <EmptyState icon={Copy} title="No duplicates found">Files are compared by their content, so renamed copies are caught. Files still processing aren't compared yet.</EmptyState>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">{groups.length} set{groups.length === 1 ? "" : "s"} of identical files. Removing the extras would free {humanSize(q.data!.reclaimableBytes)}.</p>
      {groups.map((g) => (
        <section key={g.hash} className="glass p-4">
          <ul className="space-y-1.5">
            {g.files.map((f, i) => (
              <li key={f.id} className="flex items-center gap-3 text-sm"><button onClick={() => onOpen(f.id)} className="min-w-0 flex-1 truncate text-left hover:underline">{f.display_name}</button><span className="text-xs text-muted">{humanSize(Number(f.size_bytes))} · {formatDate(f.created_at)}</span>{i === 0 && <span className="rounded-full bg-ok/15 px-2 py-0.5 text-xs text-ok">Oldest</span>}</li>
            ))}
          </ul>
          <Button size="sm" variant="glass" className="mt-3" onClick={() => void trashExtras(g)}>Move extras to trash</Button>
        </section>
      ))}
    </div>
  );
}
