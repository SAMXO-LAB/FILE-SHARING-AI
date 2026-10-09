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
  image: "bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-500/12 dark:text-fuchsia-300", video: "bg-rose-50 text-rose-600 dark:bg-rose-500/12 dark:text-rose-300", audio: "bg-amber-50 text-amber-600 dark:bg-amber-500/12 dark:text-amber-300",
  document: "bg-blue-50 text-blue-600 dark:bg-blue-500/14 dark:text-blue-300", data: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/12 dark:text-emerald-300", code: "bg-violet-50 text-violet-600 dark:bg-violet-500/12 dark:text-violet-300",
  archive: "bg-orange-50 text-orange-600 dark:bg-orange-500/12 dark:text-orange-300", link: "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/12 dark:text-cyan-300", note: "bg-yellow-50 text-yellow-700 dark:bg-yellow-500/12 dark:text-yellow-300",
  conversation: "bg-green-50 text-green-600 dark:bg-green-500/12 dark:text-green-300", other: "bg-slate-100 text-slate-500 dark:bg-slate-500/14 dark:text-slate-300",
};

export function TypeIcon({ type, category, mime, className }: { type?: string; category?: string | null; mime?: string | null; className?: string }) {
  const key = iconKey({ type, category, mime });
  const Icon = CATEGORY_ICON[key];
  const tone = TONE[type && type !== "file" ? type : category ?? "other"] ?? TONE.other!;
  return <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-[11px] ring-1 ring-inset ring-[rgb(var(--line)/0.05)]", tone, className)}><Icon className="h-[19px] w-[19px]" strokeWidth={1.8} aria-hidden /></span>;
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
