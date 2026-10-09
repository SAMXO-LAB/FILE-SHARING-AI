"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { NotebookPen, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDialogs } from "@/components/ui/confirm";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Badge, EmptyState, Skeleton } from "@/components/ui/misc";
import { api, errorMessage, useFetch } from "@/lib/client/api";
import { cn, timeAgo } from "@/lib/utils";
import type { NoteRow } from "@/lib/types";

interface NoteListItem { id: string; title: string; origin: "user" | "ai_answer"; updated_at: string; preview: string }

export function NotesPanel({ initialId }: { initialId: string | null }) {
  const router = useRouter();
  const { confirm } = useDialogs();
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const list = useFetch<{ notes: NoteListItem[]; total: number }>(`/api/notes?limit=100${dq ? `&q=${encodeURIComponent(dq)}` : ""}`);
  const reloadList = list.reload;
  useEffect(() => { const h = () => void reloadList(); window.addEventListener("memory:notes-changed", h); return () => window.removeEventListener("memory:notes-changed", h); }, [reloadList]);

  const [activeId, setActiveId] = useState<string | null>(initialId);
  const [note, setNote] = useState<NoteRow | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const saved = useRef({ title: "", body: "" });

  useEffect(() => {
    if (!activeId) { setNote(null); return; }
    setLoading(true);
    api<{ note: NoteRow }>(`/api/notes/${activeId}`)
      .then((r) => { setNote(r.note); setTitle(r.note.title); setBody(r.note.body); saved.current = { title: r.note.title, body: r.note.body }; setDirty(false); })
      .catch((e) => { toast.error("Couldn't open that note", { description: errorMessage(e) }); setActiveId(null); })
      .finally(() => setLoading(false));
  }, [activeId]);

  const save = useCallback(async () => {
    if (!activeId || !dirty) return;
    setSaving(true);
    try {
      await api(`/api/notes/${activeId}`, { method: "PATCH", body: { title: title.trim() || "Untitled note", body } });
      saved.current = { title, body };
      setDirty(false);
      void reloadList();
    } catch (e) { toast.error("Couldn't save the note", { description: errorMessage(e) }); } finally { setSaving(false); }
  }, [activeId, dirty, title, body, reloadList]);

  // Autosave shortly after typing stops.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => void save(), 1500);
    return () => clearTimeout(t);
  }, [dirty, title, body, save]);

  async function create() {
    try {
      const r = await api<{ note: NoteRow }>("/api/notes", { body: { title: "Untitled note", body: "" } });
      await reloadList();
      setActiveId(r.note.id);
    } catch (e) { toast.error(errorMessage(e)); }
  }
  async function remove() {
    if (!activeId || !(await confirm({ title: "Delete this note?", description: "It's removed from your memory and can't be recovered.", confirmLabel: "Delete", danger: true }))) return;
    try { await api(`/api/notes/${activeId}`, { method: "DELETE" }); setActiveId(null); void reloadList(); router.replace("/documents?tab=notes"); } catch (e) { toast.error(errorMessage(e)); }
  }

  const notes = list.data?.notes ?? [];
  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden /><label htmlFor="note-search" className="sr-only">Search notes</label><Input id="note-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes…" className="pl-9" /></div>
          <Button size="icon" onClick={() => void create()} aria-label="New note"><Plus className="h-4 w-4" /></Button>
        </div>
        {list.loading ? <div className="space-y-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-16" />)}</div> : notes.length === 0 ? (
          <EmptyState icon={NotebookPen} title={dq ? "No matching notes" : "No notes yet"} className="py-8">{dq ? "Try different words." : "Notes you write (or save from an AI answer) are searchable with Ask AI."}</EmptyState>
        ) : (
          <ul className="space-y-1.5" aria-label="Notes">
            {notes.map((n) => (
              <li key={n.id}><button onClick={() => { void save(); setActiveId(n.id); router.replace(`/documents?tab=notes&note=${n.id}`, { scroll: false }); }} className={cn("panel w-full p-3 text-left transition-colors hover:bg-[rgb(var(--line)/0.08)]", n.id === activeId && "!border-accent")} aria-current={n.id === activeId}>
                <p className="truncate text-sm font-medium">{n.title}</p><p className="mt-0.5 line-clamp-2 text-xs text-muted">{n.preview || "Empty note"}</p>
                <p className="mt-1.5 flex items-center gap-2 text-[11px] text-muted">{timeAgo(n.updated_at)}{n.origin === "ai_answer" && <Badge tone="accent" className="px-1.5 py-0"><Sparkles className="h-3 w-3" aria-hidden />AI answer</Badge>}</p>
              </button></li>
            ))}
          </ul>
        )}
      </div>
      <div className="glass min-h-[24rem] p-4">
        {!activeId ? <p className="grid h-full min-h-60 place-items-center text-sm text-muted">Select a note or create a new one.</p> : loading ? <Skeleton className="h-64" /> : note && (
          <div className="flex h-full flex-col gap-3">
            <div><Label htmlFor="note-title-edit" className="sr-only">Title</Label><Input id="note-title-edit" value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} maxLength={200} className="h-11 border-0 bg-transparent px-0 text-lg font-semibold focus:border-transparent" /></div>
            {note.origin === "ai_answer" && <p className="flex items-center gap-1.5 text-xs text-muted"><Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden />Saved from an AI-generated answer. Check the sources before relying on it.</p>}
            <Label htmlFor="note-body-edit" className="sr-only">Note</Label>
            <Textarea id="note-body-edit" value={body} onChange={(e) => { setBody(e.target.value); setDirty(true); }} onBlur={() => void save()} className="min-h-72 flex-1 resize-y border-0 bg-transparent px-0 leading-relaxed focus:border-transparent" placeholder="Write something…" maxLength={200000} />
            <div className="flex items-center justify-between border-t hairline pt-3 text-xs text-muted">
              <span aria-live="polite">{saving ? "Saving…" : dirty ? "Unsaved changes" : `Saved ${timeAgo(note.updated_at)}`}</span>
              <Button variant="danger-ghost" size="sm" onClick={() => void remove()}><Trash2 className="h-4 w-4" aria-hidden />Delete</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
