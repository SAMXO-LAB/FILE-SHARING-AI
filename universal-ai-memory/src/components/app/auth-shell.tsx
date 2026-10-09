import Link from "next/link";
import { Brain } from "lucide-react";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-semibold tracking-tight ${className}`}>
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-accent-fg shadow-[0_8px_24px_-8px_var(--accent)]"><Brain className="h-5 w-5" aria-hidden /></span>
      <span>Universal AI Memory</span>
    </span>
  );
}

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex justify-center"><Logo className="text-lg" /></Link>
        <div className="glass glass-strong p-6 sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <p className="mt-5 text-center text-sm text-muted">{footer}</p>}
        <p className="mt-8 text-center text-xs text-muted">Your files are stored privately. Only you can see them unless you share them.</p>
      </div>
    </main>
  );
}
