"use client";
import Link from "next/link";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { useEffect, useRef } from "react";
import { Check, FileText, Image as ImageIcon, Link2, Loader2, Lock, MessagesSquare } from "lucide-react";
import { Logo, LogoMark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

export { Logo, LogoMark };

const ease = [0.2, 0.8, 0.2, 1] as const;

/**
 * Sign-in / sign-up frame: the logo pops in, the card springs up, fields arrive one after another,
 * and the card gives a small shake whenever `errorKey` changes (a failed attempt).
 */
export function AuthShell({ title, subtitle, children, footer, errorKey }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode; errorKey?: number }) {
  const card = useAnimationControls();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (errorKey) void card.start({ x: [0, -10, 9, -6, 4, 0], transition: { duration: 0.45 } });
  }, [errorKey, card]);

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      <AuthBackdrop />
      <div className="relative w-full max-w-md">
        <motion.div initial={{ opacity: 0, y: -10, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.5, ease }} className="mb-8 flex justify-center">
          <Link href="/" className="focus-ring rounded-xl" aria-label="Share Files AI home"><Logo size="md" tagline /></Link>
        </motion.div>
        <motion.div animate={card}>
          <motion.div
            initial={{ opacity: 0, y: 26, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 26, delay: 0.05 }}
            className="relative rounded-[calc(var(--radius)*1.35)] border hairline bg-card p-6 shadow-[var(--shadow-lg)] sm:p-8"
          >
            <div aria-hidden className="pointer-events-none absolute inset-x-10 -top-px h-px bg-gradient-to-r from-transparent via-[#2F8CFF] to-transparent opacity-70" />
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={title} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
                <h1 className="text-[23px] font-semibold tracking-[-0.025em]">{title}</h1>
                {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
              </motion.div>
            </AnimatePresence>
            <div className="auth-stagger mt-6">{children}</div>
          </motion.div>
        </motion.div>
        {footer && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }} className="mt-5 text-center text-sm text-muted">{footer}</motion.p>}
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="mt-8 flex items-center justify-center gap-1.5 text-center text-xs text-subtle">
          <Lock className="h-3 w-3" aria-hidden />Your files are private. Only you can see them unless you share them.
        </motion.p>
      </div>
    </main>
  );
}

/** Soft moving light and drifting file chips behind the auth card (decorative). */
function AuthBackdrop() {
  const chips = [
    { icon: FileText, label: "Report.pdf", cls: "left-[6%] top-[18%]", d: 0 },
    { icon: ImageIcon, label: "Trip photos", cls: "right-[7%] top-[24%]", d: 1.4 },
    { icon: MessagesSquare, label: "Team chat", cls: "left-[9%] bottom-[18%]", d: 0.8 },
    { icon: Link2, label: "Saved link", cls: "right-[10%] bottom-[14%]", d: 2.1 },
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <motion.div
        className="absolute left-1/2 top-[-12%] h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,#2F8CFF_22%,transparent),transparent)] blur-2xl"
        animate={{ scale: [1, 1.08, 1], opacity: [0.8, 1, 0.8] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-[-18%] right-[-10%] h-[420px] w-[520px] rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,#8b5cf6_14%,transparent),transparent)] blur-2xl"
        animate={{ x: [0, -40, 0], y: [0, -20, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      {chips.map((c, i) => (
        <motion.div
          key={c.label}
          className={cn("absolute hidden items-center gap-2 rounded-xl border hairline bg-card px-3 py-2 text-[12px] font-medium text-muted shadow-[var(--shadow-md)] lg:flex", c.cls)}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1, y: [0, -10, 0] }}
          transition={{ opacity: { delay: 0.4 + i * 0.12, duration: 0.5 }, scale: { delay: 0.4 + i * 0.12, duration: 0.5 }, y: { delay: c.d, duration: 6, repeat: Infinity, ease: "easeInOut" } }}
        >
          <c.icon className="h-4 w-4 text-accent" />{c.label}
        </motion.div>
      ))}
    </div>
  );
}

/** Primary auth button with press feedback, a shimmer while working and a check once it succeeds. */
export function AuthSubmit({ children, busy, done, busyLabel, doneLabel, disabled }: { children: React.ReactNode; busy: boolean; done?: boolean; busyLabel: string; doneLabel: string; disabled?: boolean }) {
  const state = done ? "done" : busy ? "busy" : "idle";
  return (
    <motion.button
      type="submit"
      disabled={disabled || busy || done}
      aria-busy={busy || undefined}
      whileHover={state === "idle" && !disabled ? { y: -1 } : undefined}
      whileTap={state === "idle" && !disabled ? { scale: 0.97 } : undefined}
      className={cn(
        "auth-submit relative inline-flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-[calc(var(--radius)*0.7)] text-[15px] font-semibold text-white transition-[box-shadow,filter,opacity,background-color] duration-200 disabled:cursor-not-allowed",
        state === "done" ? "bg-ok" : "bg-gradient-to-r from-[#2F8CFF] via-accent to-[#1E4FD8]",
        disabled && state === "idle" && "opacity-55",
      )}
    >
      {state === "busy" && <span aria-hidden className="auth-submit-shimmer absolute inset-0" />}
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={state} className="relative inline-flex items-center gap-2" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
          {state === "busy" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {state === "done" && (
            <motion.span initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 500, damping: 20 }} className="grid h-5 w-5 place-items-center rounded-full bg-white/25">
              <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
            </motion.span>
          )}
          {state === "busy" ? busyLabel : state === "done" ? doneLabel : children}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
