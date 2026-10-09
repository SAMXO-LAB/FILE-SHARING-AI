"use client";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Camera, FileUp, FolderUp, ImageIcon, Link2, MessageSquareText, NotebookPen, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldError, Hint, Input, Label, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { Switch } from "@/components/ui/overlay";
import { errorMessage } from "@/lib/client/api";
import { mayUseAi } from "@/lib/ai/privacy";
import { parseUrlLines, saveLinks, saveNote } from "@/lib/client/ingest";
import { useApp } from "./app-context";
import { ImportWizard } from "./import-wizard";
import { useUploads } from "./upload-context";

type Tab = "files" | "link" | "note" | "import";
interface AddApi { openAdd: (tab?: Tab, opts?: { folderId?: string | null }) => void }
const Ctx = createContext<AddApi | null>(null);
export const useAddToMemory = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAddToMemory must be used inside AddToMemoryProvider");
  return v;
};

function FilesTab({ folderId, onAdded }: { folderId: string | null; onAdded: () => void }) {
  const { add } = useUploads();
  const picks = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    add(Array.from(files), { folderId });
    onAdded();
  };
  const input = "sr-only";
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">PDFs, documents, spreadsheets, images, audio, video, archives and more. You can also drag files anywhere on this page.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="glass flex cursor-pointer items-center gap-3 p-4  transition-transform">
          <FileUp className="h-5 w-5 text-accent" aria-hidden /><span className="text-sm font-medium">Choose files</span>
          <input type="file" multiple className={input} onChange={(e) => { picks(e.target.files); e.target.value = ""; }} />
        </label>
        <label className="glass flex cursor-pointer items-center gap-3 p-4  transition-transform">
          <FolderUp className="h-5 w-5 text-accent" aria-hidden /><span className="text-sm font-medium">Choose a folder</span>
          {/* @ts-expect-error webkitdirectory is non-standard but widely supported */}
          <input type="file" multiple webkitdirectory="" className={input} onChange={(e) => { picks(e.target.files); e.target.value = ""; }} />
        </label>
        <label className="glass flex cursor-pointer items-center gap-3 p-4  transition-transform sm:hidden">
          <ImageIcon className="h-5 w-5 text-accent" aria-hidden /><span className="text-sm font-medium">Photos and videos</span>
          <input type="file" multiple accept="image/*,video/*" className={input} onChange={(e) => { picks(e.target.files); e.target.value = ""; }} />
        </label>
        <label className="glass flex cursor-pointer items-center gap-3 p-4  transition-transform sm:hidden">
          <Camera className="h-5 w-5 text-accent" aria-hidden /><span className="text-sm font-medium">Take a photo</span>
          <input type="file" accept="image/*" capture="environment" className={input} onChange={(e) => { picks(e.target.files); e.target.value = ""; }} />
        </label>
      </div>
      <Hint>Executable programs aren't accepted. Large files upload in pieces and resume if your connection drops.</Hint>
    </div>
  );
}

function LinkTab({ onAdded }: { onAdded: () => void }) {
  const { caps, prefs } = useApp();
  const canSummarize = caps.ai && mayUseAi(prefs.processing_mode, caps.aiLocality);
  const [text, setText] = useState("");
  const [summarize, setSummarize] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const urls = parseUrlLines(text.includes("://") ? text : text.split(/\r?\n/).map((l) => (l.trim() ? `https://${l.trim()}` : "")).join("\n"));
    if (!urls) { setError("Enter one web address per line (http or https)."); return; }
    setBusy(true);
    setError(null);
    const r = await saveLinks(urls, {}, { summarize: summarize && canSummarize });
    setBusy(false);
    if (r.saved + r.dupes > 0) onAdded();
  }
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="links">Web addresses</Label>
        <Textarea id="links" value={text} onChange={(e) => setText(e.target.value)} placeholder={"https://example.com/article\nhttps://…"} rows={4} aria-invalid={!!error} />
        <FieldError>{error}</FieldError>
        <Hint>The page text is fetched by our server (never from private networks) and indexed so you can search it.</Hint>
      </div>
      {canSummarize && (
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-accent" aria-hidden />Also write a short AI summary</span>
          <Switch checked={summarize} onCheckedChange={setSummarize} aria-label="Write an AI summary" />
        </label>
      )}
      <Button onClick={submit} loading={busy} disabled={!text.trim()}>Save link{text.includes("\n") ? "s" : ""}</Button>
    </div>
  );
}

function NoteTab({ onAdded }: { onAdded: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-4">
      <div><Label htmlFor="note-title">Title <span className="font-normal text-muted">(optional)</span></Label><Input id="note-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} /></div>
      <div><Label htmlFor="note-body">Note</Label><Textarea id="note-body" rows={7} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write or paste anything you want to be able to find later." /></div>
      <Button loading={busy} disabled={!body.trim()} onClick={async () => {
        setBusy(true);
        try { await saveNote(body, title); onAdded(); } catch (e) { toast.error("Couldn't save the note", { description: errorMessage(e) }); } finally { setBusy(false); }
      }}>Save note</Button>
    </div>
  );
}

export function AddToMemoryProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("files");
  const [folder, setFolder] = useState<string | null>(null);
  const openAdd = useCallback((t: Tab = "files", opts?: { folderId?: string | null }) => { setFolder(opts?.folderId ?? null); setTab(t); setOpen(true); }, []);
  const value = useMemo(() => ({ openAdd }), [openAdd]);
  const close = () => setOpen(false);
  return (
    <Ctx.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Add to Memory" description="Everything you add is private to you and searchable with Ask AI." className="max-w-xl">
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList>
              <TabsTrigger value="files"><FileUp className="h-3.5 w-3.5" aria-hidden />Files</TabsTrigger>
              <TabsTrigger value="link"><Link2 className="h-3.5 w-3.5" aria-hidden />Link</TabsTrigger>
              <TabsTrigger value="note"><NotebookPen className="h-3.5 w-3.5" aria-hidden />Note</TabsTrigger>
              <TabsTrigger value="import"><MessageSquareText className="h-3.5 w-3.5" aria-hidden />Chat import</TabsTrigger>
            </TabsList>
            <TabsContent value="files"><FilesTab folderId={folder} onAdded={close} /></TabsContent>
            <TabsContent value="link"><LinkTab onAdded={close} /></TabsContent>
            <TabsContent value="note"><NoteTab onAdded={close} /></TabsContent>
            <TabsContent value="import"><ImportWizard onDone={close} /></TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}
