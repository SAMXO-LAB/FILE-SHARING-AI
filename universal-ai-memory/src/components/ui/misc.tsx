import * as React from "react";
import { Loader2, type LucideIcon } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton h-4 w-full", className)} />;
}

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return <Loader2 role="status" aria-label={label} className={cn("h-5 w-5 animate-spin text-muted", className)} />;
}

const badge = cva("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border", {
  variants: {
    tone: {
      neutral: "border-line text-muted bg-glass",
      accent: "border-accent/40 text-accent bg-accent/10",
      ok: "border-ok/40 text-ok bg-ok/10",
      warn: "border-warn/40 text-warn bg-warn/10",
      danger: "border-danger/40 text-danger bg-danger/10",
    },
  },
  defaultVariants: { tone: "neutral" },
});
export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...props} />;
}

export function EmptyState({ icon: Icon, title, children, action, className }: { icon?: LucideIcon; title: string; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("panel flex flex-col items-center gap-3 px-6 py-12 text-center", className)}>
      {Icon && <div className="grid h-12 w-12 place-items-center rounded-2xl bg-accent/15 text-accent"><Icon className="h-6 w-6" aria-hidden /></div>}
      <h3 className="text-base font-semibold">{title}</h3>
      {children && <p className="max-w-md text-sm text-muted">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="panel flex flex-col items-center gap-3 border-danger/40 px-6 py-10 text-center">
      <p className="text-sm text-danger">{message}</p>
      {onRetry && <button onClick={onRetry} className="text-sm underline underline-offset-4">Try again</button>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Progress({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} className={cn("h-1.5 w-full overflow-hidden rounded-full bg-[rgb(var(--line)/0.15)]", className)}>
      <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${v}%` }} />
    </div>
  );
}
