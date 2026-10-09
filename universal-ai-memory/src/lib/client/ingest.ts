"use client";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/client/api";

export interface DropTarget {
  folderId?: string | null;
  collectionId?: string | null;
}

export interface Dropped {
  files: File[];
  urls: string[];
  text: string | null;
}

const URL_RE = /^https?:\/\/\S+$/i;

/** Splits text into http(s) URLs when EVERY non-empty line is a URL; otherwise returns null. */
export function parseUrlLines(text: string): string[] | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  if (lines.length === 0 || lines.length > 50) return null;
  return lines.every((l) => URL_RE.test(l)) ? lines : null;
}

async function readEntry(entry: FileSystemEntry, out: File[], depth = 0): Promise<void> {
  if (depth > 12 || out.length > 2000) return;
  if (entry.isFile) {
    const file = await new Promise<File | null>((res) => (entry as FileSystemFileEntry).file(res, () => res(null)));
    if (file && !file.name.startsWith(".")) out.push(file);
    return;
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((res) => reader.readEntries(res, () => res([])));
      if (batch.length === 0) break;
      for (const e of batch) await readEntry(e, out, depth + 1);
    }
  }
}

/** Reads a drop event's payload. Must be called synchronously inside the event handler. */
export async function readDataTransfer(dt: DataTransfer): Promise<Dropped> {
  const entries: FileSystemEntry[] = [];
  const looseFiles: File[] = [];
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind !== "file") continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
    else { const f = item.getAsFile(); if (f) looseFiles.push(f); }
  }
  const uriList = dt.getData("text/uri-list");
  const plain = dt.getData("text/plain");

  const files = [...looseFiles];
  for (const e of entries) await readEntry(e, files);

  let urls: string[] = [];
  let text: string | null = null;
  if (files.length === 0) {
    urls = uriList.split(/\r?\n/).map((l) => l.trim()).filter((l) => URL_RE.test(l));
    if (urls.length === 0 && plain) {
      const lines = parseUrlLines(plain);
      if (lines) urls = lines;
      else if (plain.trim()) text = plain.trim();
    }
  }
  return { files, urls: [...new Set(urls)].slice(0, 50), text };
}

async function addToCollection(collectionId: string, type: "file" | "link" | "note", id: string) {
  try {
    await api(`/api/collections/${collectionId}/items`, { body: { items: [{ type, id }] } });
    window.dispatchEvent(new Event("memory:collections-changed"));
  } catch { /* the item is saved; only the collection link failed */ }
}

export async function saveLinks(urls: string[], target: DropTarget = {}, opts: { summarize?: boolean; tags?: string[] } = {}) {
  let saved = 0, dupes = 0;
  const failures: string[] = [];
  for (const url of urls) {
    try {
      const r = await api<{ link: { id: string }; duplicate: boolean }>("/api/links", { body: { url, summarize: opts.summarize, tags: opts.tags } });
      if (r.duplicate) dupes++; else saved++;
      if (target.collectionId) await addToCollection(target.collectionId, "link", r.link.id);
    } catch (e) {
      failures.push(`${url.slice(0, 60)}: ${errorMessage(e)}`);
    }
  }
  if (saved) toast.success(`Saved ${saved} link${saved === 1 ? "" : "s"}`, { description: "Fetching the page text in the background." });
  if (dupes) toast.info(`${dupes} link${dupes === 1 ? " was" : "s were"} already saved`);
  for (const f of failures.slice(0, 3)) toast.error("Couldn't save link", { description: f });
  window.dispatchEvent(new Event("memory:links-changed"));
  return { saved, dupes, failures };
}

export async function saveNote(body: string, title?: string, target: DropTarget = {}) {
  const firstLine = body.split(/\r?\n/).find((l) => l.trim())?.trim().slice(0, 80) ?? "Untitled note";
  const r = await api<{ note: { id: string } }>("/api/notes", { body: { title: title?.trim() || firstLine, body } });
  if (target.collectionId) await addToCollection(target.collectionId, "note", r.note.id);
  toast.success("Saved as a note");
  window.dispatchEvent(new Event("memory:notes-changed"));
  return r.note.id;
}

export { addToCollection };
