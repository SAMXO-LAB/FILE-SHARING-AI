import { Archive, Code2, File as FileIcon, FileAudio, FileSpreadsheet, FileText, FileVideo, ImageIcon, Link2, MessagesSquare, NotebookPen, Presentation, Table2 } from "lucide-react";
import { Badge } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

const CATEGORY_ICON = { image: ImageIcon, video: FileVideo, audio: FileAudio, archive: Archive, code: Code2, data: Table2, document: FileText, other: FileIcon, link: Link2, note: NotebookPen, conversation: MessagesSquare, spreadsheet: FileSpreadsheet, presentation: Presentation } as const;
export type IconKey = keyof typeof CATEGORY_ICON;

export function iconKey(opts: { type?: string; category?: string | null; mime?: string | null }): IconKey {
  if (opts.type === "link" || opts.type === "note" || opts.type === "conversation") return opts.type;
  const mime = (opts.mime ?? "").toLowerCase();
  if (mime.includes("spreadsheet") || mime === "text/csv") return "spreadsheet";
  if (mime.includes("presentation")) return "presentation";
  const c = opts.category ?? "other";
  return c in CATEGORY_ICON ? (c as IconKey) : "other";
}

const TONE: Record<string, string> = {
  image: "bg-fuchsia-500/15 text-fuchsia-400", video: "bg-rose-500/15 text-rose-400", audio: "bg-amber-500/15 text-amber-400",
  document: "bg-sky-500/15 text-sky-400", data: "bg-emerald-500/15 text-emerald-400", code: "bg-violet-500/15 text-violet-400",
  archive: "bg-orange-500/15 text-orange-400", link: "bg-cyan-500/15 text-cyan-400", note: "bg-yellow-500/15 text-yellow-400",
  conversation: "bg-green-500/15 text-green-400", other: "bg-slate-500/15 text-slate-400",
};

export function TypeIcon({ type, category, mime, className }: { type?: string; category?: string | null; mime?: string | null; className?: string }) {
  const key = iconKey({ type, category, mime });
  const Icon = CATEGORY_ICON[key];
  const tone = TONE[type && type !== "file" ? type : category ?? "other"] ?? TONE.other!;
  return <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", tone, className)}><Icon className="h-5 w-5" aria-hidden /></span>;
}

export function StatusBadge({ status, detail }: { status: string | null | undefined; detail?: string | null }) {
  if (!status || status === "ready") return null;
  const map: Record<string, { label: string; tone: "warn" | "danger" | "accent" | "neutral" }> = {
    uploading: { label: "Uploading", tone: "accent" }, uploaded: { label: "Queued", tone: "accent" }, queued: { label: "Queued", tone: "accent" },
    processing: { label: "Processing", tone: "accent" }, fetching: { label: "Fetching", tone: "accent" },
    failed: { label: "Failed", tone: "danger" }, unsupported: { label: "Not readable", tone: "warn" },
  };
  const m = map[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={m.tone} title={detail ?? undefined}>{m.label}</Badge>;
}
