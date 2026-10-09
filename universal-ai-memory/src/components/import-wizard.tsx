"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, FileUp, Loader2, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/overlay";
import { api, errorMessage } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { useUploads } from "./upload-context";

type Kind = "whatsapp_export" | "telegram_export";

const GUIDE: Record<Kind, { title: string; icon: typeof MessageCircle; accept: string; steps: string[]; note: string }> = {
  whatsapp_export: {
    title: "WhatsApp chat export", icon: MessageCircle, accept: ".txt,.zip",
    steps: ["Open the chat in WhatsApp.", "Tap the chat name → Export chat (iPhone) or ⋮ → More → Export chat (Android).", "Choose “Without media” (smaller) or “Include media”.", "Save the .txt or .zip file, then upload it here."],
    note: "WhatsApp has no way to sync automatically. You export a chat yourself and upload it; nothing is read from WhatsApp itself. Re-importing a newer export of the same chat only adds the new messages.",
  },
  telegram_export: {
    title: "Telegram chat export", icon: Send, accept: ".json,.zip",
    steps: ["Open Telegram Desktop (the phone apps can't export).", "Open a chat → ⋮ → Export chat history.", "Set Format to “Machine-readable JSON”, then Export.", "Upload the result.json file (or a .zip of the export folder)."],
    note: "HTML exports aren't supported yet; choose JSON. You can also link the Telegram bot in Connected Apps to save messages you send it going forward.",
  },
};

interface Props { onDone?: () => void; initialKind?: Kind }

type Phase = "idle" | "uploading" | "starting" | "started";

/** Guided import of a chat export the user exported themselves (no automatic sync is claimed). */
export function ImportWizard({ onDone, initialKind }: Props) {
  const uploads = useUploads();
  const [kind, setKind] = useState<Kind | null>(initialKind ?? null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [dateOrder, setDateOrder] = useState("auto");
  const [phaseState, setPhase] = useState<Phase>("idle");
  const [errorState, setError] = useState<string | null>(null);
  const fileId = useRef<string | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  // If the upload itself failed or was cancelled, let the user try again from here.
  const failedUpload = phaseState === "uploading" ? uploads.items.find((i) => i.purpose === "import_source" && i.name === file?.name && (i.status === "failed" || i.status === "cancelled")) : undefined;
  const phase: Phase = failedUpload ? "idle" : phaseState;
  const error = errorState ?? (failedUpload?.status === "failed" ? failedUpload.error ?? "The upload failed." : null);

  async function start() {
    if (!kind || !file) return;
    setError(null);
    setPhase("uploading");
    uploads.add([file], {
      purpose: "import_source",
      onUploaded: async (id) => {
        fileId.current = id;
        setPhase("starting");
        try {
          await api("/api/imports/start", { body: { fileId: id, kind, title: title.trim() || undefined, dateOrder: kind === "whatsapp_export" ? dateOrder : "auto", tzOffsetMinutes: new Date().getTimezoneOffset() } });
          setPhase("started");
          toast.success("Import started", { description: "You can keep using the app. We'll finish in the background." });
          window.dispatchEvent(new Event("memory:imports-changed"));
          onDone?.();
        } catch (e) {
          setPhase("idle");
          setError(errorMessage(e));
        }
      },
    });
  }

  if (!kind) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(GUIDE) as Kind[]).map((k) => {
          const g = GUIDE[k];
          return (
            <button key={k} onClick={() => setKind(k)} className="glass flex flex-col items-start gap-2 p-4 text-left card-hover">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent"><g.icon className="h-5 w-5" aria-hidden /></span>
              <span className="font-medium">{g.title}</span>
              <span className="text-xs text-muted">Import a file you exported yourself.</span>
            </button>
          );
        })}
      </div>
    );
  }

  const g = GUIDE[kind];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-medium"><g.icon className="h-4 w-4 text-accent" aria-hidden />{g.title}</h3>
        {!initialKind && phase === "idle" && <button className="text-xs text-muted hover:text-fg" onClick={() => { setKind(null); setFile(null); }}>Change</button>}
      </div>

      <div className="panel">
        <button className="flex w-full items-center justify-between px-4 py-3 text-sm" onClick={() => setShowSteps((s) => !s)} aria-expanded={showSteps}>
          How do I export?
          <ChevronDown className={cn("h-4 w-4 transition-transform", showSteps && "rotate-180")} aria-hidden />
        </button>
        {showSteps && <ol className="list-decimal space-y-1 px-8 pb-4 text-sm text-muted">{g.steps.map((s) => <li key={s}>{s}</li>)}</ol>}
      </div>
      <p className="text-xs text-muted">{g.note}</p>

      <div>
        <Label htmlFor="export-file">Export file</Label>
        <label htmlFor="export-file" className={cn("glass flex cursor-pointer items-center gap-3 p-3 text-sm", phase !== "idle" && "pointer-events-none opacity-70")}>
          <FileUp className="h-5 w-5 text-accent" aria-hidden />
          <span className="truncate">{file ? file.name : `Choose a ${g.accept.replaceAll(",", " or ")} file`}</span>
        </label>
        <input id="export-file" type="file" accept={g.accept} className="sr-only" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="import-title">Chat name <span className="font-normal text-muted">(optional)</span></Label>
          <Input id="import-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Taken from the file if empty" />
        </div>
        {kind === "whatsapp_export" && (
          <div>
            <Label htmlFor="date-order">Date format</Label>
            <Select id="date-order" value={dateOrder} onValueChange={setDateOrder} options={[
              { value: "auto", label: "Detect automatically" }, { value: "dmy", label: "Day / Month / Year" }, { value: "mdy", label: "Month / Day / Year" }, { value: "ymd", label: "Year / Month / Day" },
            ]} />
          </div>
        )}
      </div>
      {kind === "whatsapp_export" && <p className="text-xs text-muted">WhatsApp exports don't include a time zone, so times are read in your current one. Names shown come from the export file and aren't verified identities.</p>}

      {error && <p role="alert" className="flex items-start gap-2 text-sm text-danger"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{error}</p>}
      {phase === "started" ? (
        <p className="flex items-center gap-2 text-sm text-ok"><CheckCircle2 className="h-4 w-4" aria-hidden />Import started. <Link href="/integrations" className="underline">See progress</Link></p>
      ) : (
        <Button onClick={start} disabled={!file || phase !== "idle"}>
          {phase !== "idle" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {phase === "uploading" ? "Uploading…" : phase === "starting" ? "Starting import…" : "Upload and import"}
        </Button>
      )}
    </div>
  );
}
