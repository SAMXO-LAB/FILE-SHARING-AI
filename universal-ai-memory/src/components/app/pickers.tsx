"use client";
import { useMemo, useState } from "react";
import { Folder, FolderPlus, Layers, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { Skeleton } from "@/components/ui/misc";
import { api, errorMessage, useFetch } from "@/lib/client/api";
import { cn } from "@/lib/utils";

export interface FolderRow { id: string; parent_id: string | null; name: string; fileCount: number }

/** Flattens folders into a depth-first list with indentation levels. */
export function flattenFolders(folders: FolderRow[]): { folder: FolderRow; depth: number }[] {
  const children = new Map<string | null, FolderRow[]>();
  for (const f of folders) children.set(f.parent_id, [...(children.get(f.parent_id) ?? []), f]);
  const out: { folder: FolderRow; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const f of (children.get(parent) ?? []).sort((a, b) => a.name.localeCompare(b.name))) {
      out.push({ folder: f, depth });
      if (depth < 20) walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function FolderPicker({ open, onOpenChange, title = "Move to folder", confirmLabel = "Move here", exclude, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; title?: string; confirmLabel?: string; exclude?: string[]; onPick: (folderId: string | null) => Promise<void> | void }) {
  const folders = useFetch<{ folders: FolderRow[] }>(open ? "/api/folders" : null);
  const [selected, setSelected] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const flat = useMemo(() => flattenFolders(folders.data?.folders ?? []).filter((x) => !exclude?.includes(x.folder.id)), [folders.data, exclude]);
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setSelected(undefined); }}>
      <DialogContent title={title}>
        <div className="max-h-72 space-y-1 overflow-y-auto" role="listbox" aria-label="Folders">
          <button role="option" aria-selected={selected === null} onClick={() => setSelected(null)} className={cn("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[rgb(var(--line)/0.1)]", selected === null && "bg-accent/15")}><Folder className="h-4 w-4" aria-hidden />All files (no folder)</button>
          {folders.loading && <Skeleton className="h-9" />}
          {flat.map(({ folder, depth }) => (
            <button key={folder.id} role="option" aria-selected={selected === folder.id} onClick={() => setSelected(folder.id)} style={{ paddingLeft: 12 + depth * 18 }} className={cn("flex w-full items-center gap-2 rounded-lg py-2 pr-3 text-left text-sm hover:bg-[rgb(var(--line)/0.1)]", selected === folder.id && "bg-accent/15")}><Folder className="h-4 w-4 text-accent" aria-hidden />{folder.name}</button>
          ))}
          {!folders.loading && flat.length === 0 && <p className="px-3 py-2 text-sm text-muted">No folders yet. Create one from All Files.</p>}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={selected === undefined} loading={busy} onClick={async () => { setBusy(true); try { await onPick(selected ?? null); onOpenChange(false); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); } }}>{confirmLabel}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export interface CollectionRow { id: string; name: string; description: string | null; color: string | null; itemCount: number }

export function CollectionPicker({ open, onOpenChange, items, onAdded }: { open: boolean; onOpenChange: (o: boolean) => void; items: { type: "file" | "link" | "note" | "conversation"; id: string }[]; onAdded?: () => void }) {
  const cols = useFetch<{ collections: CollectionRow[] }>(open ? "/api/collections" : null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function addTo(id: string, label: string) {
    setBusy(true);
    try {
      const r = await api<{ added: number }>(`/api/collections/${id}/items`, { body: { items } });
      toast.success(r.added ? `Added ${r.added} item${r.added === 1 ? "" : "s"} to “${label}”` : `Already in “${label}”`);
      onAdded?.();
      onOpenChange(false);
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  }
  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const r = await api<{ collection: { id: string; name: string } }>("/api/collections", { body: { name: name.trim() } });
      setName("");
      await addTo(r.collection.id, r.collection.name);
    } catch (e) { toast.error(errorMessage(e)); setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add to collection" description={`${items.length} item${items.length === 1 ? "" : "s"} selected`}>
        <div className="max-h-60 space-y-1 overflow-y-auto">
          {cols.loading && <Skeleton className="h-9" />}
          {cols.data?.collections.map((c) => (
            <button key={c.id} disabled={busy} onClick={() => void addTo(c.id, c.name)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[rgb(var(--line)/0.1)]">
              <Layers className="h-4 w-4" style={{ color: c.color ?? "var(--accent)" }} aria-hidden /><span className="flex-1 truncate">{c.name}</span><span className="text-xs text-muted">{c.itemCount}</span>
            </button>
          ))}
          {cols.data && cols.data.collections.length === 0 && <p className="px-3 py-2 text-sm text-muted">You don't have any collections yet. Create the first one below.</p>}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void create(); }} className="space-y-2 border-t hairline pt-4">
          <Label htmlFor="new-col"><Plus className="mr-1 inline h-3.5 w-3.5" aria-hidden />New collection</Label>
          <div className="flex gap-2"><Input id="new-col" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Tax documents 2026" /><Button type="submit" disabled={!name.trim() || busy}><FolderPlus className="h-4 w-4" aria-hidden />Create</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
