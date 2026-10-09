"use client";
import { useId } from "react";
import { Switch } from "@/components/ui/overlay";
import { cn } from "@/lib/utils";

export function Section({ title, description, children, danger }: { title: string; description?: React.ReactNode; children: React.ReactNode; danger?: boolean }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cn("glass p-5", danger && "border-danger/40")}>
      <h2 id={id} className={cn("text-base font-semibold", danger && "text-danger")}>{title}</h2>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

/** A label + explanation on the left and a control on the right. */
export function Row({ label, description, htmlFor, children }: { label: string; description?: React.ReactNode; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      <div className="min-w-0 flex-1 basis-60">
        <label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function ToggleRow({ id, label, description, checked, onChange, disabled }: { id: string; label: string; description?: React.ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <Row label={label} description={description} htmlFor={id}>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </Row>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-full border hairline p-1">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)} className={cn("rounded-full px-3 py-1 text-sm transition-colors", value === o.value ? "bg-accent text-[var(--accent-fg)]" : "text-muted hover:text-fg")}>{o.label}</button>
      ))}
    </div>
  );
}
