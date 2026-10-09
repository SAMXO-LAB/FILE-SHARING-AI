"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Layers, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui/misc";
import { api, errorMessage, useFetch } from "@/lib/client/api";
import type { CollectionRow } from "@/components/app/pickers";
import { formatDate } from "@/lib/utils";

const COLORS = ["#6366f1", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6"];

export function CollectionsView() {
  const list = useFetch<{ collections: (CollectionRow & { updated_at: string })[] }>("/api/collections");
  const reload = list.reload;
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLORS[0]!);
  const [busy, setBusy] = useState(false);

  useEffect(() => { const h = () => void reload(); window.addEventListener("memory:collections-changed", h); return () => window.removeEventListener("memory:collections-changed", h); }, [reload]);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api("/api/collections", { body: { name: name.trim(), description: description.trim() || null, color } });
      setName(""); setDescription(""); setCreating(false);
      toast.success("Collection created");
      void reload();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  }

  const cols = list.data?.collections ?? [];
  return (
    <div>
      <PageHeader
        title="Collections"
        description="Group files, links, notes and chats by project or topic. Drop files onto a collection to add them."
        actions={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden />New collection</Button>}
      />
      {list.loading ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
        : list.error ? <ErrorState message={list.error} onRetry={reload} />
        : cols.length === 0 ? (
          <EmptyState icon={Layers} title="No collections yet" action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden />Create a collection</Button>}>
            Collections are your own groupings, like “Tax documents 2026” or “Trip to Lisbon”. Nothing is moved: an item can be in several collections.
          </EmptyState>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cols.map((c) => (
              <li key={c.id} data-drop-collection={c.id} data-drop-label={c.name} className="glass relative p-4 card-hover data-[drop-hover=true]:ring-2 data-[drop-hover=true]:ring-accent">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: `${c.color ?? "#6366f1"}26`, color: c.color ?? "#6366f1" }}><Layers className="h-5 w-5" aria-hidden /></span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-semibold"><Link href={`/collections/${c.id}`} className="after:absolute after:inset-0 after:content-['']">{c.name}</Link></h2>
                    <p className="text-xs text-muted">{c.itemCount} item{c.itemCount === 1 ? "" : "s"} · updated {formatDate(c.updated_at)}</p>
                  </div>
                </div>
                {c.description && <p className="mt-3 line-clamp-2 text-sm text-muted">{c.description}</p>}
              </li>
            ))}
          </ul>
        )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent title="New collection" description="Give it a name you'll recognise later.">
          <form onSubmit={(e) => { e.preventDefault(); void create(); }} className="space-y-4">
            <div><Label htmlFor="col-name">Name</Label><Input id="col-name" autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tax documents 2026" /></div>
            <div><Label htmlFor="col-desc">Description (optional)</Label><Textarea id="col-desc" value={description} maxLength={500} rows={2} onChange={(e) => setDescription(e.target.value)} /></div>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Colour</legend>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} className="h-7 w-7 rounded-full ring-offset-2 ring-offset-[var(--card)] aria-pressed:ring-2" style={{ background: c, ["--tw-ring-color" as string]: c }} />
                ))}
              </div>
            </fieldset>
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button><Button type="submit" disabled={!name.trim() || busy} loading={busy}>Create</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
