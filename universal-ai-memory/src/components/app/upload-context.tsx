"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as tus from "tus-js-client";
import { toast } from "sonner";
import { useApp } from "./app-context";
import { api, ApiClientError, errorMessage, sha256Hex } from "@/lib/client/api";
import { createClient } from "@/lib/supabase/client";
import { publicEnv } from "@/lib/env";

export type UploadStatus = "hashing" | "queued" | "uploading" | "finalizing" | "processing" | "done" | "duplicate" | "failed" | "cancelled";

export interface UploadItem {
  id: string;
  name: string;
  size: number;
  status: UploadStatus;
  progress: number; // 0..100 (bytes uploaded)
  error?: string;
  detail?: string; // processing note from the server (e.g. "Scanned text from images")
  fileId?: string;
  duplicateOf?: { id: string; name: string };
  purpose: "memory" | "import_source";
}

export interface AddOptions {
  folderId?: string | null;
  purpose?: "memory" | "import_source";
  source?: "upload" | "ai_chat";
  /** Called when the file is uploaded and verified (before processing finishes). */
  onUploaded?: (fileId: string, name: string) => void;
  /** Called when processing reached a final state. */
  onSettled?: (fileId: string, status: string) => void;
}

interface Internal extends UploadItem { file: File; opts: AddOptions; allowDuplicate?: boolean; upload?: tus.Upload; cancelled?: boolean }

interface UploadApi {
  items: UploadItem[];
  activeCount: number;
  add: (files: File[], opts?: AddOptions) => void;
  cancel: (id: string) => void;
  retry: (id: string, opts?: { allowDuplicate?: boolean }) => void;
  dismiss: (id: string) => void;
  clearFinished: () => void;
}

const Ctx = createContext<UploadApi | null>(null);
export const useUploads = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useUploads must be used inside UploadProvider");
  return v;
};

const CONCURRENCY = 3;
const HASH_LIMIT = 64 * 1024 * 1024;
export const FILES_CHANGED = "memory:files-changed";
const notifyFilesChanged = () => window.dispatchEvent(new Event(FILES_CHANGED));

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const { prefs } = useApp();
  // Read through a ref so long-running uploads see the current setting without being re-created.
  const notify = useRef({ upload: prefs.notify_upload_complete, processing: prefs.notify_processing_complete });
  useEffect(() => { notify.current = { upload: prefs.notify_upload_complete, processing: prefs.notify_processing_complete }; }, [prefs.notify_upload_complete, prefs.notify_processing_complete]);
  const store = useRef(new Map<string, Internal>());
  const running = useRef(0);

  const publish = useCallback(() => {
    setItems([...store.current.values()].map(({ file: _f, opts: _o, upload: _u, cancelled: _c, allowDuplicate: _a, ...pub }) => pub));
  }, []);

  const patch = useCallback((id: string, p: Partial<Internal>) => {
    const it = store.current.get(id);
    if (!it) return;
    Object.assign(it, p);
    publish();
  }, [publish]);

  const pollProcessing = useCallback(async (it: Internal) => {
    patch(it.id, { status: "processing" });
    for (let i = 0; i < 90; i++) {
      if (it.cancelled) return;
      await new Promise((r) => setTimeout(r, i < 5 ? 1500 : 4000));
      try {
        const r = await api<{ file: { status: string; status_detail: string | null } }>(`/api/files/${it.fileId}`);
        const s = r.file.status;
        if (s === "ready") {
          patch(it.id, { status: "done", progress: 100, detail: r.file.status_detail ?? undefined }); it.opts.onSettled?.(it.fileId!, s); notifyFilesChanged();
          if (notify.current.processing) toast.success(`“${it.name}” is ready to search`);
          return;
        }
        if (s === "failed" || s === "unsupported") {
          patch(it.id, { status: s === "failed" ? "failed" : "done", error: s === "failed" ? (r.file.status_detail ?? "Processing failed.") : undefined, detail: r.file.status_detail ?? undefined });
          it.opts.onSettled?.(it.fileId!, s); notifyFilesChanged();
          if (notify.current.processing) (s === "failed" ? toast.error : toast.message)(s === "failed" ? `“${it.name}” couldn't be processed` : `“${it.name}” was saved but its text can't be read`);
          return;
        }
      } catch { /* transient: keep polling */ }
    }
    patch(it.id, { status: "done", detail: "Still processing in the background. Check Uploads for progress." });
  }, [patch]);

  const run = useCallback(async (it: Internal) => {
    try {
      let sha: string | undefined;
      if (it.purpose === "memory" && it.size <= HASH_LIMIT && !it.allowDuplicate) {
        patch(it.id, { status: "hashing" });
        sha = (await sha256Hex(it.file)) ?? undefined;
      }
      if (it.cancelled) return;
      const init = await api<{ duplicate?: { id: string; name: string }; file?: { id: string; storageKey: string; bucket: string }; upload?: { endpoint: string; chunkSize: number } }>("/api/files/init", {
        body: { name: it.name, size: it.size, mime: it.file.type || null, folderId: it.opts.folderId ?? null, sha256: sha, allowDuplicate: it.allowDuplicate, purpose: it.purpose, source: it.opts.source ?? "upload" },
      });
      if (init.duplicate) { patch(it.id, { status: "duplicate", duplicateOf: init.duplicate }); return; }
      const { file, upload } = init;
      if (!file || !upload) throw new Error("Unexpected server response.");
      it.fileId = file.id;
      patch(it.id, { status: "uploading", fileId: file.id, progress: 0 });

      const supabase = createClient();
      await new Promise<void>((resolve, reject) => {
        const u = new tus.Upload(it.file, {
          endpoint: upload.endpoint,
          retryDelays: [0, 1500, 4000, 10000],
          chunkSize: upload.chunkSize,
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          metadata: { bucketName: file.bucket, objectName: file.storageKey, contentType: it.file.type || "application/octet-stream", cacheControl: "3600" },
          headers: { "x-upsert": "false" },
          onBeforeRequest: async (req) => {
            const { data } = await supabase.auth.getSession();
            if (data.session) req.setHeader("Authorization", `Bearer ${data.session.access_token}`);
            if (publicEnv.supabaseKey) req.setHeader("apikey", publicEnv.supabaseKey);
          },
          onProgress: (sent, total) => patch(it.id, { progress: total ? Math.min(99, (sent / total) * 100) : 0 }),
          onError: (err) => reject(err),
          onSuccess: () => resolve(),
        });
        it.upload = u;
        u.start();
      });
      if (it.cancelled) return;

      patch(it.id, { status: "finalizing", progress: 100 });
      const done = await api<{ file: { id: string; purpose: string } }>(`/api/files/${file.id}/complete`, { method: "POST", body: {} }).catch((e: unknown) => { throw e; });
      it.opts.onUploaded?.(done.file.id, it.name);
      notifyFilesChanged();
      if (it.purpose === "memory" && notify.current.upload) toast.success(`Uploaded “${it.name}”`);
      if (it.purpose === "import_source") { patch(it.id, { status: "done", detail: "Ready to import." }); return; }
      void pollProcessing(it);
    } catch (e) {
      if (it.cancelled) return;
      const msg = e instanceof ApiClientError ? e.message : (e as { originalResponse?: unknown })?.originalResponse ? "The upload was interrupted. Try again." : errorMessage(e);
      patch(it.id, { status: "failed", error: msg });
      if (it.fileId) void api(`/api/files/${it.fileId}/abort`, { method: "POST", body: {} }).catch(() => {});
    }
  }, [patch, pollProcessing]);

  const pumpRef = useRef<() => void>(() => {});
  const pump = useCallback(() => {
    for (const it of store.current.values()) {
      if (running.current >= CONCURRENCY) break;
      if (it.status !== "queued") continue;
      running.current++;
      void run(it).finally(() => { running.current--; pumpRef.current(); });
    }
  }, [run]);
  useEffect(() => { pumpRef.current = pump; }, [pump]);

  const add = useCallback((files: File[], opts: AddOptions = {}) => {
    for (const file of files) {
      const id = crypto.randomUUID();
      store.current.set(id, { id, file, opts, name: file.name, size: file.size, status: "queued", progress: 0, purpose: opts.purpose ?? "memory" });
    }
    publish();
    pump();
  }, [publish, pump]);

  const cancel = useCallback((id: string) => {
    const it = store.current.get(id);
    if (!it) return;
    it.cancelled = true;
    try { void it.upload?.abort(true); } catch { /* already finished */ }
    if (it.fileId && ["uploading", "queued", "hashing", "finalizing"].includes(it.status)) void api(`/api/files/${it.fileId}/abort`, { method: "POST", body: {} }).catch(() => {});
    patch(id, { status: "cancelled" });
  }, [patch]);

  const retry = useCallback((id: string, o?: { allowDuplicate?: boolean }) => {
    const it = store.current.get(id);
    if (!it) return;
    if (it.fileId && it.status === "failed") void api(`/api/files/${it.fileId}/abort`, { method: "POST", body: {} }).catch(() => {});
    Object.assign(it, { status: "queued", progress: 0, error: undefined, cancelled: false, fileId: undefined, duplicateOf: undefined, allowDuplicate: o?.allowDuplicate });
    publish();
    pump();
  }, [publish, pump]);

  const dismiss = useCallback((id: string) => { store.current.delete(id); publish(); }, [publish]);
  const clearFinished = useCallback(() => {
    for (const [id, it] of store.current) if (["done", "cancelled", "duplicate"].includes(it.status)) store.current.delete(id);
    publish();
  }, [publish]);

  // Warn before leaving the page while bytes are still being sent.
  const activeCount = items.filter((i) => ["hashing", "queued", "uploading", "finalizing"].includes(i.status)).length;
  useEffect(() => {
    if (activeCount === 0) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [activeCount]);

  const value = useMemo<UploadApi>(() => ({ items, activeCount, add, cancel, retry, dismiss, clearFinished }), [items, activeCount, add, cancel, retry, dismiss, clearFinished]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
