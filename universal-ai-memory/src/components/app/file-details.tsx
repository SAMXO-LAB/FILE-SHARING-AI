"use client";
import { useEffect, useState } from "react";
import { Clock, Copy, Download, FolderInput, Layers, Pencil, RefreshCw, RotateCcw, Share2, Sparkles, Star, Tag, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Badge, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { useDialogs } from "@/components/ui/confirm";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { api, errorMessage, useFetch } from "@/lib/client/api";
import { humanSize } from "@/lib/files/types";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { FileRow } from "@/lib/types";
import { StatusBadge, TypeIcon } from "./file-visuals";
import { FilePreview } from "./file-preview";
import { CollectionPicker, FolderPicker } from "./pickers";
import { ShareDialog } from "./share-dialog";

interface OwnerView { file: FileRow; collections: { id: string; name: string; color: string | null }[]; shares: { id: string; status: string }[] }
interface SharedView { file: Pick<FileRow, "id" | "display_name" | "mime_type" | "category" | "size_bytes" | "created_at" | "status" | "ai_metadata" | "page_count">; shared: { canDownload: boolean; expiresAt: string | null; note: string | null; owner: string | null } }
type View = OwnerView | SharedView;
const isShared = (v: View): v is SharedView => "shared" in v;

const SOURCE: Record<string, string> = { upload: "Uploaded", whatsapp: "WhatsApp import", telegram: "Telegram", ai_chat: "Ask AI attachment" };
const INDEX_LABEL: Record<string, string> = { none: "Not indexed", metadata: "Name and metadata only", text: "Text searchable", semantic: "Text and meaning searchable" };

function ExtractedText({ fileId }: { fileId: string }) {
  const q = useFetch<{ pages: { page: number | null; text: string }[]; label: string | null; truncated: boolean }>(`/api/files/${fileId}/url?mode=extracted`);
  if (q.loading) return <Skeleton className="h-40" />;
  if (q.error) return <p className="text-sm text-muted">{q.error}</p>;
  return (
    <div className="space-y-3">
      {q.data?.label && <p className="text-xs text-muted">Source: {q.data.label}</p>}
      <div className="panel max-h-[45vh] space-y-4 overflow-auto p-4 text-[13px] leading-relaxed">
        {q.data?.pages.map((p, i) => <div key={i}>{p.page != null && <p className="mb-1 text-xs font-medium text-accent">Page {p.page}</p>}<p className="whitespace-pre-wrap break-words">{p.text}</p></div>)}
      </div>
      {q.data?.truncated && <p className="text-xs text-muted">Showing the first part of the text.</p>}
    </div>
  );
}

export function FileDetails({ fileId, onClose, onChanged }: { fileId: string; onClose: () => void; onChanged: () => void }) {
  const q = useFetch<View>(`/api/files/${fileId}`);
  const { confirm, prompt } = useDialogs();
  const [moveOpen, setMoveOpen] = useState(false);
  const [colOpen, setColOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const view = q.data;
  const owner = view && !isShared(view) ? view : null;

  useEffect(() => { if (owner) { setTags(owner.file.tags); setDesc(owner.file.description ?? ""); } }, [owner]);

  async function patch(body: Record<string, unknown>, ok?: string) {
    try { await api(`/api/files/${fileId}`, { method: "PATCH", body }); if (ok) toast.success(ok); await q.reload(); onChanged(); } catch (e) { toast.error(errorMessage(e)); }
  }
  async function download() {
    try { const r = await api<{ url: string }>(`/api/files/${fileId}/url?mode=download`); window.location.assign(r.url); } catch (e) { toast.error("Couldn't start the download", { description: errorMessage(e) }); }
  }
  async function act(path: string, ok: string, method: "POST" | "DELETE" = "POST") {
    setBusy(true);
    try { await api(`/api/files/${fileId}${path}`, { method, body: method === "POST" ? {} : undefined }); toast.success(ok); onChanged(); await q.reload(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent title={view?.file.display_name ?? "File"} className="max-w-3xl">
        {q.loading && <div className="space-y-3"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-56" /></div>}
        {q.error && <p role="alert" className="text-sm text-danger">{q.error}</p>}
        {view && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <TypeIcon category={view.file.category} mime={view.file.mime_type} />
              <div className="min-w-0 flex-1 text-sm text-muted">
                <p>{humanSize(Number(view.file.size_bytes))} · {view.file.mime_type ?? "unknown type"}{view.file.page_count ? ` · ${view.file.page_count} pages` : ""}</p>
                <p>Added {formatDate(view.file.created_at)}{owner ? ` · ${SOURCE[owner.file.source_id] ?? owner.file.source_id}` : ""}</p>
              </div>
              <StatusBadge status={view.file.status} detail={owner?.file.status_detail} />
              {owner?.file.deleted_at && <Badge tone="warn">In trash</Badge>}
            </div>
            {isShared(view) && (
              <div className="panel flex flex-wrap items-center gap-2 p-3 text-sm"><Users className="h-4 w-4 text-accent" aria-hidden />Shared with you by @{view.shared.owner ?? "someone"}{view.shared.expiresAt && <span className="flex items-center gap-1 text-muted"><Clock className="h-3.5 w-3.5" aria-hidden />until {formatDate(view.shared.expiresAt)}</span>}{!view.shared.canDownload && <Badge>View only</Badge>}{view.shared.note && <span className="basis-full text-muted">“{view.shared.note}”</span>}</div>
            )}
            {owner?.file.status_detail && owner.file.status !== "ready" && <p className="text-sm text-muted">{owner.file.status_detail}</p>}

            <FilePreview fileId={fileId} mime={view.file.mime_type} category={view.file.category} name={view.file.display_name} />

            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                {(owner?.file.extracted_text_key || (isShared(view) && view.shared.canDownload && view.file.status === "ready")) && <TabsTrigger value="text">Extracted text</TabsTrigger>}
                {owner && <TabsTrigger value="organize">Organize</TabsTrigger>}
              </TabsList>
              <TabsContent value="overview" className="space-y-4">
                {view.file.ai_metadata?.summary ? (
                  <div className="panel space-y-3 p-4">
                    <p className="flex items-center gap-2 text-xs text-muted"><Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden />AI-generated summary. It can contain mistakes.</p>
                    <p className="text-sm leading-relaxed">{view.file.ai_metadata.summary}</p>
                    {(view.file.ai_metadata.topics?.length ?? 0) > 0 && <div><p className="mb-1 text-xs font-medium text-muted">Topics</p><div className="flex flex-wrap gap-1.5">{view.file.ai_metadata.topics!.map((t) => <Badge key={t}>{t}</Badge>)}</div></div>}
                    {(view.file.ai_metadata.entities?.length ?? 0) > 0 && <div><p className="mb-1 text-xs font-medium text-muted">People, places and organizations mentioned</p><div className="flex flex-wrap gap-1.5">{view.file.ai_metadata.entities!.map((t) => <Badge key={t}>{t}</Badge>)}</div></div>}
                    {(view.file.ai_metadata.important_dates?.length ?? 0) > 0 && <div><p className="mb-1 text-xs font-medium text-muted">Dates mentioned in the document</p><div className="flex flex-wrap gap-1.5">{view.file.ai_metadata.important_dates!.map((t) => <Badge key={t}>{t}</Badge>)}</div></div>}
                  </div>
                ) : <p className="text-sm text-muted">{view.file.status === "ready" ? "No AI summary for this file. Summaries need a readable document, an AI provider, and a privacy mode that allows it." : "A summary will appear here once the file has been processed."}</p>}
                {owner && <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm"><dt className="text-muted">Search coverage</dt><dd>{INDEX_LABEL[owner.file.indexing_level]}</dd>{owner.file.original_date && <><dt className="text-muted">Original date</dt><dd>{formatDateTime(owner.file.original_date)}</dd></>}{owner.file.sender_label && <><dt className="text-muted">Sent by (from export)</dt><dd>{owner.file.sender_label} <span className="text-xs text-muted">(unverified)</span></dd></>}<dt className="text-muted">Storage</dt><dd>Private, encrypted at rest by the storage provider</dd></dl>}
              </TabsContent>
              <TabsContent value="text"><ExtractedText fileId={fileId} /></TabsContent>
              {owner && (
                <TabsContent value="organize" className="space-y-4">
                  <div>
                    <Label htmlFor="tag-input"><Tag className="mr-1 inline h-3.5 w-3.5" aria-hidden />Tags</Label>
                    <div className="flex flex-wrap gap-1.5 pb-2">{tags.map((t) => <span key={t} className="inline-flex items-center gap-1 rounded-full border border-line bg-glass py-0.5 pl-2.5 pr-1 text-xs">{t}<button onClick={() => { const next = tags.filter((x) => x !== t); setTags(next); void patch({ tags: next }); }} className="grid h-4 w-4 place-items-center rounded-full hover:bg-[rgb(var(--line)/0.2)]" aria-label={`Remove tag ${t}`}><X className="h-3 w-3" /></button></span>)}</div>
                    <form onSubmit={(e) => { e.preventDefault(); const v = tagInput.trim().toLowerCase(); if (!v || tags.includes(v)) return; const next = [...tags, v]; setTags(next); setTagInput(""); void patch({ tags: next }); }} className="flex gap-2"><Input id="tag-input" value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="Add a tag and press Enter" maxLength={40} /></form>
                  </div>
                  <div>
                    <Label htmlFor="file-desc">Notes about this file</Label>
                    <Textarea id="file-desc" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => { if (desc !== (owner.file.description ?? "")) void patch({ description: desc }); }} maxLength={2000} placeholder="Anything you want to remember about it (searchable by name only)." />
                  </div>
                  <div>
                    <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"><Layers className="h-3.5 w-3.5" aria-hidden />Collections</p>
                    {owner.collections.length === 0 ? <p className="text-sm text-muted">Not in any collection.</p> : <div className="flex flex-wrap gap-1.5">{owner.collections.map((c) => <Badge key={c.id} tone="accent">{c.name}</Badge>)}</div>}
                  </div>
                </TabsContent>
              )}
            </Tabs>

            <div className="flex flex-wrap gap-2 border-t hairline pt-4">
              {(!isShared(view) || view.shared.canDownload) && <Button variant="primary" size="sm" onClick={() => void download()} disabled={view.file.status === "uploading"}><Download className="h-4 w-4" aria-hidden />Download</Button>}
              {owner && !owner.file.deleted_at && (
                <>
                  <Button variant="glass" size="sm" onClick={() => void patch({ starred: !owner.file.starred })}><Star className={owner.file.starred ? "h-4 w-4 fill-current text-warn" : "h-4 w-4"} aria-hidden />{owner.file.starred ? "Starred" : "Star"}</Button>
                  <Button variant="glass" size="sm" onClick={async () => { const n = await prompt({ title: "Rename file", label: "File name", initial: owner.file.display_name, maxLength: 255 }); if (n && n !== owner.file.display_name) await patch({ name: n }, "Renamed"); }}><Pencil className="h-4 w-4" aria-hidden />Rename</Button>
                  <Button variant="glass" size="sm" onClick={() => setMoveOpen(true)}><FolderInput className="h-4 w-4" aria-hidden />Move</Button>
                  <Button variant="glass" size="sm" disabled={busy} onClick={() => void act("/copy", "Copied. The copy is being processed.")}><Copy className="h-4 w-4" aria-hidden />Duplicate</Button>
                  <Button variant="glass" size="sm" onClick={() => setColOpen(true)}><Layers className="h-4 w-4" aria-hidden />Collection</Button>
                  <Button variant="glass" size="sm" onClick={() => setShareOpen(true)}><Share2 className="h-4 w-4" aria-hidden />Share</Button>
                  {["ready", "failed", "unsupported"].includes(owner.file.status) && <Button variant="glass" size="sm" disabled={busy} onClick={() => void act("/reprocess", "Reprocessing started")}><RefreshCw className="h-4 w-4" aria-hidden />Reprocess</Button>}
                  <Button variant="danger-ghost" size="sm" onClick={async () => { if (await confirm({ title: "Move to trash?", description: "You can restore it for 30 days. Anyone you shared it with loses access.", confirmLabel: "Move to trash", danger: true })) { await act("", "Moved to trash", "DELETE"); onClose(); } }}><Trash2 className="h-4 w-4" aria-hidden />Trash</Button>
                </>
              )}
              {owner?.file.deleted_at && (
                <>
                  <Button variant="glass" size="sm" disabled={busy} onClick={() => void act("/restore", "Restored")}><RotateCcw className="h-4 w-4" aria-hidden />Restore</Button>
                  <Button variant="danger" size="sm" onClick={async () => { if (await confirm({ title: "Delete permanently?", description: "The file and its search index are removed for good. This can't be undone.", confirmLabel: "Delete forever", danger: true })) { try { await api(`/api/files/${fileId}?permanent=1`, { method: "DELETE" }); toast.success("Deleted"); onChanged(); onClose(); } catch (e) { toast.error(errorMessage(e)); } } }}><Trash2 className="h-4 w-4" aria-hidden />Delete forever</Button>
                </>
              )}
            </div>
            {owner && (
              <>
                <FolderPicker open={moveOpen} onOpenChange={setMoveOpen} onPick={async (folderId) => { await patch({ folderId }, "Moved"); }} />
                <CollectionPicker open={colOpen} onOpenChange={setColOpen} items={[{ type: "file", id: fileId }]} onAdded={() => { void q.reload(); }} />
                <ShareDialog fileId={fileId} fileName={owner.file.display_name} open={shareOpen} onOpenChange={setShareOpen} />
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
