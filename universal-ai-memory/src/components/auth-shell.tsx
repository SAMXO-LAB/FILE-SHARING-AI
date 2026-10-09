import Link from "next/link";
import { Brain } from "lucide-react";

/** Brand mark: a brain glyph in a soft blue tile with a fine inner highlight. */
export function LogoMark({ size = "md" }: { size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-8 w-8 rounded-[10px]" : "h-9 w-9 rounded-[11px]";
  return (
    <span className={`relative grid ${box} shrink-0 place-items-center bg-gradient-to-b from-[color-mix(in_srgb,var(--accent)_88%,white)] to-accent text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.28),0_1px_2px_rgb(15_23_42/0.12),0_4px_10px_-4px_color-mix(in_srgb,var(--accent)_60%,transparent)]`}>
      <Brain className={size === "sm" ? "h-[17px] w-[17px]" : "h-[19px] w-[19px]"} strokeWidth={1.9} aria-hidden />
    </span>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-semibold tracking-[-0.015em] ${className}`}>
      <LogoMark />
      <span>Universal AI Memory</span>
    </span>
  );
}

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex justify-center"><Logo className="text-lg" /></Link>
        <div className="rounded-[calc(var(--radius)*1.25)] border hairline bg-card p-6 shadow-[var(--shadow-lg)] sm:p-8">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <p className="mt-5 text-center text-sm text-muted">{footer}</p>}
        <p className="mt-8 text-center text-xs text-subtle">Your files are stored privately. Only you can see them unless you share them.</p>
      </div>
    </main>
  );
}
