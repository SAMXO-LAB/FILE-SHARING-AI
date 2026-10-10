"use client";
import { AnimatePresence, motion } from "framer-motion";
import { forwardRef, useEffect, useState } from "react";
import { ArrowUp, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/** Example questions cycled in the empty AI bar. */
export const AI_PROMPTS = [
  "Ask Sam anything about your files, chats and links…",
  "Find the PDF about solar panels",
  "What did we decide about the trip budget?",
  "Show photos I saved last December",
  "Summarize the articles I saved this week",
  "Which files did Priya share with me?",
];

/** Animated gradient-ring container for an AI input. Put the input row inside. */
export const AiBar = forwardRef<HTMLDivElement, { children: React.ReactNode; className?: string; innerClassName?: string; busy?: boolean } & React.HTMLAttributes<HTMLDivElement>>(
  function AiBar({ children, className, innerClassName, busy, ...rest }, ref) {
    return (
      <div ref={ref} className={cn("ai-bar", className)} data-busy={busy ? "true" : undefined} {...rest}>
        <div className={cn("ai-bar-inner", innerClassName)}>{children}</div>
      </div>
    );
  },
);

/**
 * A placeholder that cycles through example prompts (slide + fade). Shown only while the field is
 * empty; purely visual (aria-hidden), so the field keeps a real label for screen readers.
 */
export function CyclingPlaceholder({ show, prompts = AI_PROMPTS, className, interval = 3200 }: { show: boolean; prompts?: string[]; className?: string; interval?: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!show) return;
    const t = setInterval(() => setI((n) => (n + 1) % prompts.length), interval);
    return () => clearInterval(t);
  }, [show, prompts.length, interval]);
  return (
    <span aria-hidden className={cn("pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center overflow-hidden", !show && "invisible", className)}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={i}
          className="block truncate text-subtle"
          initial={{ y: "70%", opacity: 0, filter: "blur(3px)" }}
          animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
          exit={{ y: "-70%", opacity: 0, filter: "blur(3px)" }}
          transition={{ duration: 0.38, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {prompts[i]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Gradient send button with a glow and shine; pulses gently once there's something to send. */
export function AiSendButton({ ready, busy, label = "Send", className, ...rest }: { ready: boolean; busy?: boolean; label?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <motion.button
      type="submit"
      aria-label={label}
      disabled={!ready || busy}
      whileTap={ready && !busy ? { scale: 0.9 } : undefined}
      whileHover={ready && !busy ? { scale: 1.06 } : undefined}
      data-ready={ready && !busy ? "true" : undefined}
      className={cn("ai-send grid h-10 w-10 shrink-0 place-items-center rounded-[12px] disabled:cursor-not-allowed", className)}
      {...(rest as React.ComponentProps<typeof motion.button>)}
    >
      <AnimatePresence mode="wait" initial={false}>
        {busy ? (
          <motion.span key="busy" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}><Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden /></motion.span>
        ) : (
          <motion.span key="send" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}><ArrowUp className="relative h-[18px] w-[18px]" strokeWidth={2.4} aria-hidden /></motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

/** Glowing orb with a sparkle: the visual identity of the assistant. */
export function AiOrb({ size = 72, rings = true, className }: { size?: number; rings?: boolean; className?: string }) {
  return (
    <motion.div
      aria-hidden
      className={cn("relative", className)}
      style={{ width: size, height: size }}
      animate={{ y: [0, -6, 0] }}
      transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
    >
      {rings && <><span className="ai-ring" /><span className="ai-ring" style={{ animationDelay: "1.4s" }} /></>}
      <div className="ai-orb h-full w-full">
        <motion.span animate={{ rotate: [0, 12, -8, 0], scale: [1, 1.12, 1] }} transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }} className="relative grid place-items-center">
          <Sparkles className="text-white drop-shadow-[0_2px_6px_rgb(11_30_77/0.45)]" style={{ width: size * 0.42, height: size * 0.42 }} strokeWidth={1.8} />
        </motion.span>
      </div>
    </motion.div>
  );
}

const STEPS = ["Understanding your question", "Searching your files, chats and links", "Reading the best matches", "Writing your answer"];

/** "Thinking" row: a small orb, steps that advance over time, and shimmering skeleton lines. */
export function AiThinking() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timers = [1200, 3600, 7500].map((ms, i) => setTimeout(() => setStep(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, []);
  return (
    <motion.div role="status" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3.5">
      <AiOrb size={34} rings={false} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1 pt-1">
        <AnimatePresence mode="wait">
          <motion.p key={step} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 6 }} transition={{ duration: 0.25 }} className="shimmer-text text-[14px] font-medium">
            {STEPS[step]}…
          </motion.p>
        </AnimatePresence>
        <div className="mt-3 space-y-2" aria-hidden>
          {[92, 78, 58].map((w, i) => (
            <motion.div key={i} className="skeleton h-2.5" initial={{ width: 0 }} animate={{ width: `${w}%` }} transition={{ delay: 0.15 + i * 0.12, duration: 0.6, ease: "easeOut" }} />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
