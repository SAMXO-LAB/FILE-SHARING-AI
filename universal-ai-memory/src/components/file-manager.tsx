"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDownAZ, ChevronRight, Copy, Download, Files, Folder, FolderInput, FolderPlus, Grid3X3, Layers, List, MoreHorizontal, Pencil, Plus, RotateCcw, Search, Star, Tag, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDialogs } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui/misc";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Select, Tabs, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { api, errorMessage, useFetch } from "@/lib/client/api";
import { humanSize } from "@/lib/files/types";
import { cn, formatDate } from "@/lib/utils";
import type { FileRow } from "@/lib/types";
import { useAddToMemory } from "./add-dialog";
import { DuplicatesView } from "./duplicates-view";
import { FileDetails } from "./file-details";
import { StatusBadge, TypeIcon } from "./file-visuals";
import { CollectionPicker, FolderPicker, type FolderRow } from "./pickers";
import { SharedWithMe } from "./shared-with-me";
import { Thumb } from "./thumb";
import { FILES_CHANGED } from "./upload-context";

type View = "all" | "starred" | "recent" | "shared" | "trash" | "duplicates";
const DRAG_TYPE = "application/x-memory-item";

interface Props {
  title: string;
  description: string;
  /** Restrict to these categories (Documents / Images and Videos pages). */
  categories?: string[];
  grid?: boolean;
  folders?: boolean;
  extraViews?: boolean;
  hideHeader?: boolean;
}

export function FileManager({ title, description, categories, grid: gridDefault = false, folders: withFolders = false, extraViews = true, hideHeader = false }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { openAdd } = useAddToMemory();
  const { confirm, prompt } = useDialogs();

  const [view, setView] = useState<View>((params.get("view") as View) || "all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("date");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [layout, setLayout] = useState<"list" | "grid">(gridDefault ? "grid" : "list");
  const [folder, setFolder] = useState<string | null>(null);
  const [limit, setLimit] = useState(60);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveOpen, setMoveOpen] = useState(false);
  const [colOpen, setColOpen] = useState(false);
  const openId = params.get("open");

  useEffect(() => { const t = setTimeout(() => setDebounced(search.trim()), 250); return () => clearTimeout(t); }, [search]);

  const searching = debounced.length > 0 || category !== "all" || !withFolders;
  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set("view", view === "all" || view === "starred" || view === "recent" || view === "trash" ? view : "all");
    const cats = category !== "all" ? [category] : categories;
    if (cats?.length) p.set("category", cats.join(","));
    if (debounced) p.set("q", debounced);
    if (withFolders && !searching && view === "all") p.set("folder", folder ?? "root");
    p.set("sort", sort); p.set("dir", dir); p.set("limit", String(limit));
    return p.toString();
  }, [view, category, categories, debounced, withFolders, searching, folder, sort, dir, limit]);

  const listUrl = view === "shared" || view === "duplicates" ? null : `/api/files?${query}`;
  const files = useFetch<{ files: FileRow[]; total: number }>(listUrl);
  const foldersQ = useFetch<{ folders: FolderRow[] }>(withFolders ? "/api/folders" : null);
  const reloadFiles = files.reload;
  const reloadFolders = foldersQ.reload;

  const refresh = useCallback(() => { void reloadFiles(); void reloadFolders(); }, [reloadFiles, reloadFolders]);
  useEffect(() => {
    window.addEventListener(FILES_CHANGED, refresh);
    return () => window.removeEventListener(FILES_CHANGED, refresh);
  }, [refresh]);
  // Reflect files that are still being processed.
  const anyProcessing = files.data?.files.some((f) => ["uploading", "uploaded", "queued", "processing"].includes(f.status));
  useEffect(() => {
    if (!anyProcessing) return;
    const t = setInterval(() => void reloadFiles(), 5000);
    return () => clearInterval(t);
  }, [anyProcessing, reloadFiles]);

  useEffect(() => { setSelected(new Set()); setLimit(60); }, [view, folder, category, debounced]);

  const setOpen = (id: string | null) => {
    const p = new URLSearchParams(params.toString());
    if (id) p.set("open", id); else p.delete("open");
    router.replace(`${pathname}${p.size ? `?${p}` : ""}`, { scroll: false });
  };

  const folderList = foldersQ.data?.folders ?? [];
  const currentChildren = folderList.filter((f) => f.parent_id === folder).sort((a, b) => a.name.localeCompare(b.name));
  const path = useMemo(() => {
    const byId = new Map(folderList.map((f) => [f.id, f]));
    const out: FolderRow[] = [];
    for (let cur = folder ? byId.get(folder) : undefined, i = 0; cur && i < 30; cur = cur.parent_id ? byId.get(cur.parent_id) : undefined, i++) out.unshift(cur);
    return out;
  }, [folderList, folder]);

  const rows = files.data?.files ?? [];
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  async function bulk(action: string, extra: Record<string, unknown> = {}, ids = [...selected], ok?: string) {
    try {
      const r = await api<{ affected: number }>("/api/files/bulk", { body: { ids, action, ...extra } });
      toast.success(ok ?? `${r.affected} file${r.affected === 1 ? "" : "s"} updated`);
      setSelected(new Set());
      refresh();
    } catch (e) { toast.error(errorMessage(e)); }
  }
  async function trashSelected() {
    if (await confirm({ title: `Move ${selected.size} file${selected.size === 1 ? "" : "s"} to trash?`, description: "You can restore them for 30 days. Shares stop immediately.", confirmLabel: "Move to trash", danger: true })) await bulk("trash");
  }
  async function purgeSelected() {
    if (await confirm({ title: `Delete ${selected.size} file${selected.size === 1 ? "" : "s"} forever?`, description: "Files and their search index are removed permanently.", confirmLabel: "Delete forever", danger: true })) await bulk("purge");
  }
  async function emptyTrash() {
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return;
    if (await confirm({ title: "Empty the trash?", description: `${files.data?.total ?? ids.length} file${ids.length === 1 ? "" : "s"} will be deleted permanently.`, confirmLabel: "Empty trash", danger: true })) {
      for (let i = 0; i < ids.length; i += 200) await bulk("purge", {}, ids.slice(i, i + 200), "Trash emptied");
    }
  }
  async function download(id: string) {
    try { const r = await api<{ url: string }>(`/api/files/${id}/url?mode=download`); window.location.assign(r.url); } catch (e) { toast.error("Couldn't start the download", { description: errorMessage(e) }); }
  }
  async function newFolder() {
    const name = await prompt({ title: "New folder", label: "Folder name", confirmLabel: "Create", maxLength: 120 });
    if (!name) return;
    try { await api("/api/folders", { body: { name, parentId: folder } }); void foldersQ.reload(); } catch (e) { toast.error(errorMessage(e)); }
  }
  async function renameFolder(f: FolderRow) {
    const name = await prompt({ title: "Rename folder", label: "Folder name", initial: f.name, maxLength: 120 });
    if (!name || name === f.name) return;
    try { await api(`/api/folders/${f.id}`, { method: "PATCH", body: { name } }); void foldersQ.reload(); } catch (e) { toast.error(errorMessage(e)); }
  }
  async function deleteFolder(f: FolderRow) {
    if (!(await confirm({ title: `Delete “${f.name}”?`, description: "The folder and its subfolders are removed. Files inside are kept and move to All files.", confirmLabel: "Delete folder", danger: true }))) return;
    try { await api(`/api/folders/${f.id}`, { method: "DELETE" }); if (folder === f.id) setFolder(f.parent_id); refresh(); } catch (e) { toast.error(errorMessage(e)); }
  }

  const views: { id: View; label: string; icon: typeof Files }[] = [
    { id: "all", label: "All", icon: Files },
    { id: "starred", label: "Starred", icon: Star },
    ...(extraViews ? [{ id: "recent" as View, label: "Recent", icon: RotateCcw }, { id: "shared" as View, label: "Shared with me", icon: Users }] : []),
    { id: "trash", label: "Trash", icon: Trash2 },
    ...(extraViews ? [{ id: "duplicates" as View, label: "Duplicates", icon: Copy }] : []),
  ];

  const catOptions = categories && categories.length === 1 ? [] : [
    { value: "all", label: "All types" },
    ...(categories ?? ["document", "image", "video", "audio", "data", "code", "archive", "other"]).map((c) => ({ value: c, label: c[0]!.toUpperCase() + c.slice(1) })),
  ];

  return (
    <div>
      {!hideHeader && (
        <PageHeader
          title={title}
          description={description}
          actions={<>
            {withFolders && view === "all" && <Button variant="glass" onClick={() => void newFolder()}><FolderPlus className="h-4 w-4" aria-hidden />New folder</Button>}
            <Button onClick={() => openAdd("files", { folderId: folder })}><Plus className="h-4 w-4" aria-hidden />Add files</Button>
          </>}
        />
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={view} onValueChange={(v) => { setView(v as View); setFolder(null); }}>
          <TabsList>{views.map((v) => <TabsTrigger key={v.id} value={v.id}><v.icon className="h-3.5 w-3.5" aria-hidden />{v.label}</TabsTrigger>)}</TabsList>
        </Tabs>
      </div>

      {view === "shared" ? <SharedWithMe onOpen={setOpen} /> : view === "duplicates" ? <DuplicatesView onOpen={setOpen} onChanged={refresh} /> : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-52 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <label htmlFor="file-search" className="sr-only">Search by file name</label>
              <Input id="file-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by file name…" className="pl-9" />
            </div>
            {catOptions.length > 0 && <div className="w-36"><Select aria-label="File type" value={category} onValueChange={setCategory} options={catOptions} /></div>}
            <div className="w-36"><Select aria-label="Sort by" value={sort} onValueChange={setSort} options={[{ value: "date", label: "Date added" }, { value: "name", label: "Name" }, { value: "size", label: "Size" }, { value: "type", label: "Type" }]} /></div>
            <Button variant="glass" size="icon" aria-label={dir === "asc" ? "Sorted ascending" : "Sorted descending"} onClick={() => setDir((d) => (d === "asc" ? "desc" : "asc"))}><ArrowDownAZ className={cn("h-4 w-4 transition-transform", dir === "desc" && "rotate-180")} /></Button>
            <div className="flex rounded-[calc(var(--radius)*0.62)] border hairline bg-[rgb(var(--line)/0.035)] p-0.5" role="group" aria-label="Layout">
              <Button variant="ghost" size="icon-sm" className={cn("h-8 w-8 text-muted", layout === "list" && "bg-card text-accent shadow-[var(--shadow-sm)] hover:bg-card")} aria-label="List view" aria-pressed={layout === "list"} onClick={() => setLayout("list")}><List className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon-sm" className={cn("h-8 w-8 text-muted", layout === "grid" && "bg-card text-accent shadow-[var(--shadow-sm)] hover:bg-card")} aria-label="Grid view" aria-pressed={layout === "grid"} onClick={() => setLayout("grid")}><Grid3X3 className="h-4 w-4" /></Button>
            </div>
            {view === "trash" && rows.length > 0 && <Button variant="danger-ghost" onClick={() => void emptyTrash()}><Trash2 className="h-4 w-4" aria-hidden />Empty trash</Button>}
          </div>

          {withFolders && view === "all" && !searching && (
            <nav aria-label="Folder path" className="mb-3 flex flex-wrap items-center gap-1 text-sm">
              <button onClick={() => setFolder(null)} data-drop-folder="root" data-drop-label="All files" onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_TYPE)) e.preventDefault(); }} onDrop={(e) => { const raw = e.dataTransfer.getData(DRAG_TYPE); if (raw) { e.preventDefault(); e.stopPropagation(); void bulk("move", { folderId: null }, JSON.parse(raw), "Moved"); } }} className={cn("rounded-lg px-2 py-1 text-muted transition-colors hover:bg-[rgb(var(--line)/0.05)] hover:text-fg", !folder && "font-medium text-fg")}>All files</button>
              {path.map((p) => <span key={p.id} className="flex items-center gap-1"><ChevronRight className="h-3.5 w-3.5 text-muted" aria-hidden /><button onClick={() => setFolder(p.id)} className={cn("rounded-lg px-2 py-1 text-muted transition-colors hover:bg-[rgb(var(--line)/0.05)] hover:text-fg", p.id === folder && "font-medium text-fg")}>{p.name}</button></span>)}
            </nav>
          )}

          {withFolders && view === "all" && !searching && currentChildren.length > 0 && (
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Folders">
              {currentChildren.map((f) => (
                <div
                  key={f.id} data-drop-folder={f.id} data-drop-label={f.name}
                  onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_TYPE)) { e.preventDefault(); e.currentTarget.setAttribute("data-drop-hover", "true"); } }}
                  onDragLeave={(e) => e.currentTarget.removeAttribute("data-drop-hover")}
                  onDrop={(e) => { e.currentTarget.removeAttribute("data-drop-hover"); const raw = e.dataTransfer.getData(DRAG_TYPE); if (raw) { e.preventDefault(); e.stopPropagation(); void bulk("move", { folderId: f.id }, JSON.parse(raw), `Moved to ${f.name}`); } }}
                  className="card card-hover flex items-center gap-3 p-3"
                >
                  <button onClick={() => setFolder(f.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent"><Folder className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden /></span><span className="min-w-0"><span className="block truncate text-sm font-medium">{f.name}</span><span className="block text-xs text-muted">{f.fileCount} file{f.fileCount === 1 ? "" : "s"}</span></span></button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Folder options for ${f.name}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => void renameFolder(f)}><Pencil className="h-4 w-4" aria-hidden />Rename</DropdownMenuItem><DropdownMenuItem danger onSelect={() => void deleteFolder(f)}><Trash2 className="h-4 w-4" aria-hidden />Delete folder</DropdownMenuItem></DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}

          {selected.size > 0 && (
            <div className="glass-float animate-rise sticky top-16 z-10 mb-3 flex flex-wrap items-center gap-2 p-2 pl-4 lg:top-4" role="toolbar" aria-label="Actions for selected files">
              <span className="mr-2 text-sm font-medium">{selected.size} selected</span>
              {view === "trash" ? (
                <><Button size="sm" variant="glass" onClick={() => void bulk("restore")}><RotateCcw className="h-4 w-4" aria-hidden />Restore</Button><Button size="sm" variant="danger" onClick={() => void purgeSelected()}><Trash2 className="h-4 w-4" aria-hidden />Delete forever</Button></>
              ) : (
                <>
                  <Button size="sm" variant="glass" onClick={() => setMoveOpen(true)}><FolderInput className="h-4 w-4" aria-hidden />Move</Button>
                  <Button size="sm" variant="glass" onClick={() => setColOpen(true)}><Layers className="h-4 w-4" aria-hidden />Collection</Button>
                  <Button size="sm" variant="glass" onClick={() => void bulk("star")}><Star className="h-4 w-4" aria-hidden />Star</Button>
                  <Button size="sm" variant="glass" onClick={async () => { const t = await prompt({ title: "Add tags", label: "Tags (comma separated)", confirmLabel: "Add", maxLength: 200 }); if (t) await bulk("add_tags", { tags: t.split(",").map((x) => x.trim()).filter(Boolean) }); }}><Tag className="h-4 w-4" aria-hidden />Tag</Button>
                  <Button size="sm" variant="danger-ghost" onClick={() => void trashSelected()}><Trash2 className="h-4 w-4" aria-hidden />Trash</Button>
                </>
              )}
              <Button size="icon-sm" variant="ghost" className="ml-auto" aria-label="Clear selection" onClick={() => setSelected(new Set())}><X className="h-4 w-4" /></Button>
            </div>
          )}

          {files.loading ? (
            <div className={layout === "grid" ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" : "space-y-2"}>{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className={layout === "grid" ? "aspect-square" : "h-14"} />)}</div>
          ) : files.error ? <ErrorState message={files.error} onRetry={refresh} />
          : rows.length === 0 ? (
            view === "trash" ? <EmptyState icon={Trash2} title="Trash is empty">Deleted files stay here for 30 days before they're removed for good.</EmptyState>
            : view === "starred" ? <EmptyState icon={Star} title="No starred files">Star a file to keep it handy.</EmptyState>
            : debounced || category !== "all" ? <EmptyState icon={Search} title="No files match">Try a different name or clear the filters.</EmptyState>
            : <EmptyState icon={Files} title={categories ? "Nothing here yet" : "No files yet"} action={<Button onClick={() => openAdd("files", { folderId: folder })}><Plus className="h-4 w-4" aria-hidden />Add files</Button>}>Drag files anywhere on this page, or use Add files. They'll be read and become searchable with Ask AI.</EmptyState>
          ) : layout === "grid" ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {rows.map((f) => (
                <li key={f.id} draggable={withFolders && view === "all"} onDragStart={(e) => { e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(selected.has(f.id) ? [...selected] : [f.id])); e.dataTransfer.effectAllowed = "move"; }} className={cn("card card-hover group relative p-2", selected.has(f.id) && "border-accent ring-2 ring-accent/25")}>
                  <button onClick={() => setOpen(f.id)} className="block w-full text-left" aria-label={`Open ${f.display_name}`}>
                    <Thumb id={f.id} category={f.category} mime={f.mime_type} name={f.display_name} />
                    <p className="mt-2 truncate px-1 text-[13.5px] font-medium">{f.display_name}</p>
                    <p className="truncate px-1 text-xs text-muted">{humanSize(Number(f.size_bytes))} · {formatDate(f.created_at)}</p>
                  </button>
                  <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggle(f.id)} aria-label={`Select ${f.display_name}`} className={cn("absolute left-3.5 top-3.5 h-5 w-5 accent-[var(--accent)]", !selected.has(f.id) && selected.size === 0 && "opacity-0 focus:opacity-100 group-hover:opacity-100")} />
                  {f.status !== "ready" && <div className="absolute right-3.5 top-3.5"><StatusBadge status={f.status} detail={f.status_detail} /></div>}
                </li>
              ))}
            </ul>
          ) : (
            <div className="card overflow-hidden !p-0">
              <div className="flex items-center gap-3 border-b hairline bg-[rgb(var(--line)/0.02)] px-4 py-2.5 text-xs font-medium text-muted">
                <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))} aria-label="Select all files" className="h-4 w-4 accent-[var(--accent)]" />
                <span className="flex-1">Name</span><span className="hidden w-20 text-right sm:block">Size</span><span className="hidden w-28 text-right md:block">Added</span><span className="w-20" />
              </div>
              <ul className="divide-y divide-[rgb(var(--line)/0.08)]">
                {rows.map((f) => (
                  <li key={f.id} draggable={withFolders && view === "all"} onDragStart={(e) => { e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(selected.has(f.id) ? [...selected] : [f.id])); e.dataTransfer.effectAllowed = "move"; }} className={cn("group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[rgb(var(--line)/0.025)]", selected.has(f.id) && "bg-accent-soft hover:bg-accent-soft")}>
                    <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggle(f.id)} aria-label={`Select ${f.display_name}`} className="h-4 w-4 accent-[var(--accent)]" />
                    <button onClick={() => setOpen(f.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <TypeIcon category={f.category} mime={f.mime_type} className="h-9 w-9" />
                      <span className="min-w-0"><span className="block truncate text-sm font-medium">{f.display_name}</span><span className="flex items-center gap-2 text-xs text-muted">{f.tags.slice(0, 3).map((t) => <Badge key={t} className="px-1.5 py-0">{t}</Badge>)}{f.status !== "ready" && <StatusBadge status={f.status} detail={f.status_detail} />}</span></span>
                    </button>
                    <span className="hidden w-20 text-right text-xs text-muted sm:block">{humanSize(Number(f.size_bytes))}</span>
                    <span className="hidden w-28 text-right text-xs text-muted md:block">{formatDate(f.deleted_at ?? f.created_at)}</span>
                    <div className="flex w-20 justify-end">
                      {view !== "trash" && <Button size="icon-sm" variant="ghost" aria-label={f.starred ? `Unstar ${f.display_name}` : `Star ${f.display_name}`} aria-pressed={f.starred} onClick={() => void bulk(f.starred ? "unstar" : "star", {}, [f.id], f.starred ? "Unstarred" : "Starred")}><Star className={cn("h-4 w-4", f.starred && "fill-current text-warn")} /></Button>}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Options for ${f.display_name}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setOpen(f.id)}>Open details</DropdownMenuItem>
                          {f.status !== "uploading" && <DropdownMenuItem onSelect={() => void download(f.id)}><Download className="h-4 w-4" aria-hidden />Download</DropdownMenuItem>}
                          <DropdownMenuSeparator />
                          {view === "trash" ? (
                            <><DropdownMenuItem onSelect={() => void bulk("restore", {}, [f.id], "Restored")}><RotateCcw className="h-4 w-4" aria-hidden />Restore</DropdownMenuItem><DropdownMenuItem danger onSelect={async () => { if (await confirm({ title: "Delete permanently?", description: `“${f.display_name}” can't be recovered.`, confirmLabel: "Delete forever", danger: true })) await bulk("purge", {}, [f.id], "Deleted"); }}><Trash2 className="h-4 w-4" aria-hidden />Delete forever</DropdownMenuItem></>
                          ) : (
                            <DropdownMenuItem danger onSelect={() => void bulk("trash", {}, [f.id], "Moved to trash")}><Trash2 className="h-4 w-4" aria-hidden />Move to trash</DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {files.data && files.data.total > rows.length && (
            <div className="mt-4 text-center"><Button variant="glass" onClick={() => setLimit((l) => l + 60)}>Show more ({files.data.total - rows.length} left)</Button></div>
          )}
        </>
      )}

      {openId && <FileDetails fileId={openId} onClose={() => setOpen(null)} onChanged={refresh} />}
      <FolderPicker open={moveOpen} onOpenChange={setMoveOpen} onPick={async (folderId) => { await bulk("move", { folderId }, [...selected], "Moved"); }} />
      <CollectionPicker open={colOpen} onOpenChange={setColOpen} items={[...selected].map((id) => ({ type: "file" as const, id }))} onAdded={() => setSelected(new Set())} />
    </div>
  );
}
