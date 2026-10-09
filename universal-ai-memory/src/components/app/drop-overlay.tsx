"use client";
import { useEffect, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/client/api";
import { addToCollection, readDataTransfer, saveLinks, saveNote, type DropTarget } from "@/lib/client/ingest";
import { cn } from "@/lib/utils";
import { useUploads } from "./upload-context";

const INTERNAL = "application/x-memory-item";

function targetOf(el: EventTarget | null): { target: DropTarget; label: string | null; el: Element | null; attach?: boolean } {
  const zone = (el as Element | null)?.closest?.("[data-drop-folder],[data-drop-collection],[data-drop-attach]") ?? null;
  if (!zone) return { target: {}, label: null, el: null };
  if (zone.hasAttribute("data-drop-attach")) return { target: {}, label: zone.getAttribute("data-drop-label"), el: zone, attach: true };
  const folder = zone.getAttribute("data-drop-folder");
  const collection = zone.getAttribute("data-drop-collection");
  return { target: { folderId: folder === "root" ? null : folder, collectionId: collection }, label: zone.getAttribute("data-drop-label"), el: zone };
}

/**
 * Window-wide drop zone. Dropping files, folders, links or text anywhere adds them to memory;
 * elements marked with data-drop-folder / data-drop-collection act as specific drop targets.
 */
export function DropOverlay() {
  const uploads = useUploads();
  const [active, setActive] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  const [attach, setAttach] = useState(false);
  const depth = useRef(0);
  const hovered = useRef<Element | null>(null);
  const addRef = useRef(uploads.add);
  useEffect(() => { addRef.current = uploads.add; }, [uploads.add]);

  useEffect(() => {
    const relevant = (e: DragEvent) => {
      const types = Array.from(e.dataTransfer?.types ?? []);
      if (types.includes(INTERNAL)) return false;
      return types.includes("Files") || types.includes("text/uri-list") || types.includes("text/plain");
    };
    const setHover = (el: Element | null) => {
      if (hovered.current === el) return;
      hovered.current?.removeAttribute("data-drop-hover");
      el?.setAttribute("data-drop-hover", "true");
      hovered.current = el;
    };
    const reset = () => { depth.current = 0; setActive(false); setLabel(null); setAttach(false); setHover(null); document.documentElement.removeAttribute("data-dragging"); };

    const onEnter = (e: DragEvent) => {
      if (!relevant(e)) return;
      e.preventDefault();
      depth.current++;
      setActive(true);
      document.documentElement.setAttribute("data-dragging", "true");
    };
    const onOver = (e: DragEvent) => {
      if (!relevant(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      const t = targetOf(e.target);
      setHover(t.el);
      setLabel(t.label);
      setAttach(Boolean(t.attach));
    };
    const onLeave = (e: DragEvent) => {
      if (!relevant(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) reset();
    };
    const onDrop = (e: DragEvent) => {
      if (!relevant(e) || !e.dataTransfer) return;
      e.preventDefault();
      const t = targetOf(e.target);
      const dt = e.dataTransfer;
      reset();
      void (async () => {
        try {
          const dropped = await readDataTransfer(dt);
          // Attachment zones (e.g. the Ask AI composer) only receive the files; nothing is sent or shared
          // until the user presses Send there.
          if (t.attach && t.el) {
            if (dropped.files.length) t.el.dispatchEvent(new CustomEvent("memory:attach-files", { detail: dropped.files }));
            else toast.error("Only files can be attached", { description: "Paste links or text into the message instead." });
            return;
          }
          if (dropped.files.length) {
            const collectionId = t.target.collectionId;
            addRef.current(dropped.files, {
              folderId: t.target.folderId ?? null,
              onUploaded: collectionId ? (id) => void addToCollection(collectionId, "file", id) : undefined,
            });
            toast(`Uploading ${dropped.files.length} file${dropped.files.length === 1 ? "" : "s"}${t.label ? ` to ${t.label}` : ""}`);
          } else if (dropped.urls.length) {
            await saveLinks(dropped.urls, t.target);
          } else if (dropped.text) {
            await saveNote(dropped.text, undefined, t.target);
          } else {
            toast.error("Nothing to add", { description: "That drop didn't contain a file, link or text." });
          }
        } catch (err) {
          toast.error("Couldn't add that", { description: errorMessage(err) });
        }
      })();
    };
    // Block the browser's default "open the file in this tab" for stray drops.
    const onWindowDragOver = (e: DragEvent) => { if (relevant(e)) e.preventDefault(); };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragover", onWindowDragOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragover", onWindowDragOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  if (!active) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[80] grid place-items-center bg-[color-mix(in_srgb,var(--bg)_55%,transparent)] p-6 backdrop-blur-[2px]" role="status" aria-live="polite">
      <div className={cn("animate-rise flex max-w-md flex-col items-center gap-3 rounded-[calc(var(--radius)*1.3)] border-2 border-dashed border-accent/45 bg-card px-10 py-11 text-center shadow-[var(--shadow-lg)] transition-opacity", (label || attach) && "opacity-90")}>
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent"><UploadCloud className="h-7 w-7" strokeWidth={1.8} aria-hidden /></div>
        <p className="text-[17px] font-semibold tracking-tight">{attach ? "Drop to attach to your question" : label ? `Drop to add to ${label}` : "Drop files to add them to your AI Memory."}</p>
        <p className="text-sm text-muted">{attach ? "Files are attached to the message. Nothing is sent until you press Send." : "Files, folders, links and text are all welcome."}</p>
      </div>
    </div>
  );
}
