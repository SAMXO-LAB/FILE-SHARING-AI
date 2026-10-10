"use client";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { ArrowUp, FileText, Image as ImageIcon, Link2, MessagesSquare, Search, Sparkles } from "lucide-react";

const QUESTION = "What did we decide about the Goa trip budget?";
const ANSWER = "You agreed on a ₹18,000 budget per person, with flights booked by Friday";

type Phase = "typing" | "searching" | "answer";

/**
 * Looping illustration of the product (sample content, not real data): a question is typed, sources
 * are searched, and a cited answer appears with the matching files. Static when reduced motion is on.
 */
export function HeroDemo() {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>(reduce ? "answer" : "typing");
  const [typed, setTyped] = useState(reduce ? QUESTION.length : 0);

  useEffect(() => {
    if (reduce) return;
    let t: ReturnType<typeof setTimeout>;
    if (phase === "typing") {
      if (typed < QUESTION.length) t = setTimeout(() => setTyped((n) => n + 1), 38);
      else t = setTimeout(() => setPhase("searching"), 500);
    } else if (phase === "searching") {
      t = setTimeout(() => setPhase("answer"), 1500);
    } else {
      t = setTimeout(() => { setTyped(0); setPhase("typing"); }, 6500);
    }
    return () => clearTimeout(t);
  }, [phase, typed, reduce]);

  return (
    <div className="relative" aria-label="Illustration of asking a question and getting a cited answer" role="img">
      {/* soft glow */}
      <div aria-hidden className="absolute -inset-10 -z-10 rounded-[48px] bg-[radial-gradient(60%_60%_at_50%_40%,color-mix(in_srgb,var(--accent)_18%,transparent),transparent_70%)] blur-2xl" />
      <div className="overflow-hidden rounded-[22px] border hairline bg-card shadow-[var(--shadow-lg)]">
        {/* window chrome */}
        <div className="flex items-center gap-1.5 border-b hairline bg-[rgb(var(--line)/0.025)] px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#fca5a5]" /><span className="h-2.5 w-2.5 rounded-full bg-[#fcd34d]" /><span className="h-2.5 w-2.5 rounded-full bg-[#86efac]" />
          <span className="ml-3 text-[11px] font-medium text-subtle">Share Files AI · Ask AI</span>
        </div>
        <div className="space-y-4 p-4 sm:p-5">
          {/* question */}
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl border border-accent/15 bg-accent-soft px-3.5 py-2 text-[13.5px] text-fg">
              {QUESTION.slice(0, typed)}
              {phase === "typing" && <motion.span aria-hidden className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-accent" animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.9, repeat: Infinity }} />}
            </div>
          </div>

          <div className="min-h-[214px]">
            <AnimatePresence mode="wait">
              {phase === "searching" && (
                <motion.div key="s" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2.5">
                  <p className="flex items-center gap-2 text-[12.5px] text-muted"><Search className="h-3.5 w-3.5 text-accent" aria-hidden />Searching your files, chats and links…</p>
                  {[MessagesSquare, FileText, Link2].map((Icon, i) => (
                    <motion.div key={i} className="flex items-center gap-2.5 rounded-xl border hairline px-3 py-2" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.18 }}>
                      <Icon className="h-4 w-4 text-subtle" aria-hidden />
                      <motion.span className="h-2 rounded-full bg-[rgb(var(--line)/0.08)]" initial={{ width: 0 }} animate={{ width: `${70 - i * 15}%` }} transition={{ delay: 0.1 + i * 0.18, duration: 0.6 }} />
                    </motion.div>
                  ))}
                </motion.div>
              )}
              {phase === "answer" && (
                <motion.div key="a" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} className="space-y-3">
                  <div className="rounded-2xl border hairline p-3.5">
                    <p className="mb-2 flex items-center gap-1.5 text-[11.5px] font-medium text-muted"><span className="grid h-5 w-5 place-items-center rounded-md bg-accent-soft"><Sparkles className="h-3 w-3 text-accent" aria-hidden /></span>Answer from your memory</p>
                    <p className="text-[13.5px] leading-relaxed">
                      {ANSWER}
                      <Cite n={1} /> and hotel options shortlisted in the shared sheet<Cite n={2} />.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[{ icon: MessagesSquare, t: "Goa trip 🌴", s: "WhatsApp · 14 messages", tone: "bg-green-50 text-green-600 dark:bg-green-500/12 dark:text-green-300" }, { icon: FileText, t: "Hotels shortlist.xlsx", s: "Spreadsheet · 18 KB", tone: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/12 dark:text-emerald-300" }].map((c, i) => (
                      <motion.div key={c.t} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + i * 0.12 }} className="flex items-center gap-2.5 rounded-xl border hairline p-2.5">
                        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${c.tone}`}><c.icon className="h-4 w-4" aria-hidden /></span>
                        <span className="min-w-0"><span className="block truncate text-[12px] font-medium">{c.t}</span><span className="block truncate text-[10.5px] text-muted">{c.s}</span></span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* composer */}
          <div className="flex items-center gap-2 rounded-2xl border hairline bg-card px-3 py-2 shadow-[var(--shadow-sm)]">
            <span className="flex-1 truncate text-[12.5px] text-subtle">Ask anything about your digital life…</span>
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-white"><ArrowUp className="h-3.5 w-3.5" aria-hidden /></span>
          </div>
        </div>
      </div>

      {/* floating file chips */}
      <FloatChip className="-left-6 top-16 hidden sm:flex" delay={0} icon={FileText} label="Resume.pdf" tone="text-blue-600" />
      <FloatChip className="-right-5 top-40 hidden sm:flex" delay={1.2} icon={ImageIcon} label="Receipt.jpg" tone="text-fuchsia-600" />
      <FloatChip className="-left-4 bottom-10 hidden md:flex" delay={2.1} icon={Link2} label="Saved article" tone="text-cyan-700" />
    </div>
  );
}

function Cite({ n }: { n: number }) {
  return <span className="mx-0.5 inline-grid h-4 min-w-4 -translate-y-px place-items-center rounded-[5px] border border-accent/20 bg-accent-soft px-1 align-middle text-[9.5px] font-semibold text-accent">{n}</span>;
}

function FloatChip({ className, delay, icon: Icon, label, tone }: { className: string; delay: number; icon: typeof FileText; label: string; tone: string }) {
  return (
    <motion.div
      aria-hidden
      className={`absolute items-center gap-2 rounded-xl border hairline bg-card px-3 py-2 text-[12px] font-medium shadow-[var(--shadow-md)] ${className}`}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1, y: [0, -8, 0] }}
      transition={{ opacity: { delay: 0.6 + delay * 0.2, duration: 0.5 }, scale: { delay: 0.6 + delay * 0.2, duration: 0.5 }, y: { delay, duration: 5, repeat: Infinity, ease: "easeInOut" } }}
    >
      <Icon className={`h-4 w-4 ${tone}`} aria-hidden />{label}
    </motion.div>
  );
}
