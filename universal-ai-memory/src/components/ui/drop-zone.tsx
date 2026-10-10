"use client";
import { useEffect, useId, useRef } from "react";
import { UploadCloud, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface DropZoneProps {
  onFiles: (files: File[]) => void;
  /** Short verb phrase shown while dragging, e.g. "add them to memory". */
  dropLabel: string;
  title?: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  multiple?: boolean;
  accept?: string;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
  id?: string;
}

/**
 * A click-or-drop file target. Drops are routed here by the window-wide DropOverlay (via the
 * `memory:attach-files` event), so dragging onto it never triggers the page-level "add to memory".
 */
export function DropZone({ onFiles, dropLabel, title, hint, icon: Icon = UploadCloud, multiple = true, accept, disabled, compact, className, id }: DropZoneProps) {
  const ref = useRef<HTMLLabelElement>(null);
  const autoId = useId();
  const inputId = id ?? `dz-${autoId}`;
  const cb = useRef(onFiles);
  useEffect(() => { cb.current = onFiles; }, [onFiles]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = (e: Event) => {
      if (disabled) return;
      const files = (e as CustomEvent<File[]>).detail ?? [];
      if (files.length) cb.current(multiple ? files : files.slice(0, 1));
    };
    el.addEventListener("memory:attach-files", h);
    return () => el.removeEventListener("memory:attach-files", h);
  }, [disabled, multiple]);

  return (
    <label
      ref={ref}
      htmlFor={inputId}
      data-drop-attach
      data-drop-local
      data-drop-label={dropLabel}
      className={cn(
        "drop-zone group relative flex cursor-pointer items-center gap-4 rounded-[calc(var(--radius)*1.1)] border-[1.5px] border-dashed border-[rgb(var(--line)/0.16)] bg-[rgb(var(--line)/0.015)] text-left transition-[border-color,background-color,transform,box-shadow] duration-200",
        "hover:border-accent/50 hover:bg-accent-soft/60 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25",
        compact ? "p-3" : "flex-col justify-center p-7 text-center sm:p-8",
        disabled && "pointer-events-none opacity-60",
        className,
      )}
    >
      <span className={cn("drop-zone-icon grid shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-105", compact ? "h-10 w-10" : "h-14 w-14")}>
        <Icon className={compact ? "h-5 w-5" : "h-7 w-7"} strokeWidth={1.8} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className={cn("block font-medium text-fg", compact ? "truncate text-sm" : "text-[15px]")}>
          {title ?? <>Drag &amp; drop files here, or <span className="text-accent underline-offset-2 group-hover:underline">browse</span></>}
        </span>
        {hint && <span className={cn("mt-1 block text-muted", compact ? "truncate text-xs" : "text-[13px]")}>{hint}</span>}
      </span>
      <input
        id={inputId}
        type="file"
        multiple={multiple}
        accept={accept}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) onFiles(f); e.target.value = ""; }}
      />
    </label>
  );
}
