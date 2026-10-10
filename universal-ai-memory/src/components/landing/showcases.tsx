"use client";
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  Check, CheckCheck, FileArchive, FileImage, FileText, FileVideo, FolderOpen, Layers, Link2, MessageSquareText, MousePointer2, Radio, Send, ShieldCheck,
  Smartphone, Sparkles, UploadCloud, UserPlus, Users, Laptop, Ban,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Item, Reveal, Stagger } from "./motion";

const ease = [0.2, 0.8, 0.2, 1] as const;

/** Runs a looping phase machine only while the element is on screen (and not at all with reduced motion). */
function usePhases<T extends string>(phases: readonly { readonly name: T; readonly ms: number }[], final: T) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-80px" });
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const [loop, setLoop] = useState(0);
  useEffect(() => {
    if (reduce || !inView) return;
    const t = setTimeout(() => {
      if (i + 1 >= phases.length) { setI(0); setLoop((n) => n + 1); } else setI(i + 1);
    }, phases[i]!.ms);
    return () => clearTimeout(t);
  }, [i, inView, reduce, phases]);
  return { ref, phase: reduce ? final : phases[i]!.name, loop: reduce ? 0 : loop };
}

/* ---------------------------------------------------------------------------------------------- */
/* Drag and drop                                                                                   */
/* ---------------------------------------------------------------------------------------------- */

const DROP_FILES = [
  { name: "Resume.pdf", size: "320 KB", icon: FileText, tone: "text-rose-600 bg-rose-50 dark:bg-rose-500/12 dark:text-rose-300" },
  { name: "Goa trip.mp4", size: "84 MB", icon: FileVideo, tone: "text-violet-600 bg-violet-50 dark:bg-violet-500/12 dark:text-violet-300" },
  { name: "Logo final.psd", size: "12 MB", icon: FileImage, tone: "text-sky-600 bg-sky-50 dark:bg-sky-500/12 dark:text-sky-300" },
  { name: "Project.zip", size: "48 MB", icon: FileArchive, tone: "text-amber-600 bg-amber-50 dark:bg-amber-500/12 dark:text-amber-300" },
];
const DROP_PHASES = [
  { name: "drag", ms: 1500 },
  { name: "over", ms: 700 },
  { name: "upload", ms: 1400 },
  { name: "done", ms: 1900 },
] as const;
type DropPhase = (typeof DROP_PHASES)[number]["name"];

const DROP_TARGETS = [
  { icon: UploadCloud, label: "Anywhere on a page" },
  { icon: FolderOpen, label: "Onto a folder" },
  { icon: Layers, label: "Onto a collection" },
  { icon: Sparkles, label: "Into Ask Sam" },
  { icon: Users, label: "Onto a friend" },
  { icon: MessageSquareText, label: "Chat exports" },
];

function DropDemo() {
  const { ref, phase, loop } = usePhases<DropPhase>(DROP_PHASES, "done");
  const file = DROP_FILES[loop % DROP_FILES.length]!;
  const done = DROP_FILES.slice(0, (loop % DROP_FILES.length) + (phase === "done" ? 1 : 0)).slice(-3).reverse();
  const hovering = phase === "over" || phase === "upload";
  return (
    <div ref={ref} className="relative" role="img" aria-label="Illustration: a file is dragged onto the page, uploads, and becomes searchable">
      <div aria-hidden className="absolute -inset-8 -z-10 rounded-[48px] bg-[radial-gradient(60%_60%_at_50%_40%,color-mix(in_srgb,var(--accent)_16%,transparent),transparent_70%)] blur-2xl" />
      <div className="overflow-hidden rounded-[22px] border hairline bg-card shadow-[var(--shadow-lg)]">
        <div className="flex items-center gap-1.5 border-b hairline bg-[rgb(var(--line)/0.025)] px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#fca5a5]" /><span className="h-2.5 w-2.5 rounded-full bg-[#fcd34d]" /><span className="h-2.5 w-2.5 rounded-full bg-[#86efac]" />
          <span className="ml-3 text-[11px] font-medium text-subtle">Share Files AI · All Files</span>
        </div>
        <div className="space-y-3 p-4 sm:p-5">
          <motion.div
            animate={hovering ? { scale: 1.02 } : { scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            className={cn(
              "relative grid h-36 place-items-center rounded-2xl border-2 border-dashed text-center transition-colors duration-300",
              hovering ? "border-accent bg-accent-soft" : "border-[rgb(var(--line)/0.16)] bg-[rgb(var(--line)/0.015)]",
            )}
          >
            <div className="flex flex-col items-center gap-2">
              <motion.span animate={hovering ? { y: [0, -5, 0] } : { y: 0 }} transition={{ duration: 0.8, repeat: hovering ? Infinity : 0 }} className="grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent">
                <UploadCloud className="h-5 w-5" aria-hidden />
              </motion.span>
              <span className="text-[13px] font-medium">{hovering ? "Drop to add it" : "Drag & drop any file"}</span>
              <span className="text-[11px] text-muted">Documents, video, design files, archives…</span>
            </div>
            {hovering && <motion.span aria-hidden className="absolute inset-0 rounded-2xl" initial={{ boxShadow: "0 0 0 0 rgb(47 140 255 / 0.4)" }} animate={{ boxShadow: "0 0 0 10px rgb(47 140 255 / 0)" }} transition={{ duration: 0.9, repeat: Infinity }} />}
          </motion.div>

          <div className="min-h-[148px] space-y-2">
            <AnimatePresence initial={false}>
              {phase === "upload" && (
                <motion.div key={`up-${loop}`} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-3 rounded-xl border border-accent/25 bg-accent-soft/50 p-2.5">
                  <span className={cn("grid h-9 w-9 place-items-center rounded-lg", file.tone)}><file.icon className="h-4 w-4" aria-hidden /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-medium">{file.name}</p>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[rgb(var(--line)/0.1)]"><motion.div className="h-full rounded-full bg-gradient-to-r from-[#2F8CFF] to-[#1E4FD8]" initial={{ width: "4%" }} animate={{ width: "100%" }} transition={{ duration: 1.2, ease: "easeInOut" }} /></div>
                  </div>
                  <span className="text-[10.5px] text-muted">Uploading</span>
                </motion.div>
              )}
              {done.map((f, k) => (
                <motion.div layout key={f.name} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease }} className="flex items-center gap-3 rounded-xl border hairline p-2.5">
                  <span className={cn("grid h-9 w-9 place-items-center rounded-lg", f.tone)}><f.icon className="h-4 w-4" aria-hidden /></span>
                  <div className="min-w-0 flex-1"><p className="truncate text-[12.5px] font-medium">{f.name}</p><p className="text-[10.5px] text-muted">{f.size}</p></div>
                  <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium", k === 0 && phase === "done" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-300" : "text-muted")}>
                    <Check className="h-3 w-3" aria-hidden />Searchable
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* The file being dragged, with the cursor */}
      <AnimatePresence>
        {(phase === "drag" || phase === "over") && (
          <motion.div
            key={`drag-${loop}`}
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 z-10"
            initial={{ x: -40, y: 230, opacity: 0, rotate: -8 }}
            animate={phase === "drag" ? { x: 120, y: 110, opacity: 1, rotate: -4 } : { x: 150, y: 120, opacity: 1, rotate: 0, scale: 0.92 }}
            exit={{ opacity: 0, scale: 0.6, y: 140, transition: { duration: 0.25 } }}
            transition={{ duration: phase === "drag" ? 1.3 : 0.5, ease }}
          >
            <div className="flex items-center gap-2 rounded-xl border hairline bg-card px-3 py-2 text-[12px] font-medium shadow-[var(--shadow-lg)]">
              <span className={cn("grid h-6 w-6 place-items-center rounded-md", file.tone)}><file.icon className="h-3.5 w-3.5" /></span>{file.name}
            </div>
            <MousePointer2 className="absolute -bottom-4 -right-3 h-5 w-5 fill-white text-[#0B1E4D] drop-shadow" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function DragDropShowcase() {
  return (
    <section id="drag-drop" aria-labelledby="dd-h" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
      <div className="grid items-center gap-14 lg:grid-cols-2">
        <Reveal className="order-2 lg:order-1">
          <DropDemo />
        </Reveal>
        <div className="order-1 lg:order-2">
          <Reveal>
            <p className="eyebrow">Drag and drop</p>
            <h2 id="dd-h" className="mt-2 text-[28px] font-semibold tracking-[-0.025em] sm:text-[34px]">Just drop it. <span className="text-gradient-brand">Any file, anywhere.</span></h2>
            <p className="mt-3 text-[15.5px] leading-relaxed text-muted">
              Drag files straight from your desktop or Downloads folder onto any page. Folders, links and copied text work too. Large files upload in pieces and pick up where they left off if your connection drops.
            </p>
          </Reveal>
          <Stagger className="mt-7 grid grid-cols-2 gap-2.5 sm:grid-cols-3" gap={0.06}>
            {DROP_TARGETS.map((t) => (
              <Item key={t.label}>
                <motion.div whileHover={{ y: -3, scale: 1.02 }} className="flex h-full items-center gap-2.5 rounded-xl border border-dashed border-accent/30 bg-card px-3 py-2.5 text-[13px] font-medium shadow-[var(--shadow-xs)]">
                  <t.icon className="h-4 w-4 shrink-0 text-accent" aria-hidden />{t.label}
                </motion.div>
              </Item>
            ))}
          </Stagger>
          <Reveal delay={0.15}>
            <p className="mt-5 flex items-center gap-2 text-[13px] text-muted"><ShieldCheck className="h-4 w-4 text-accent" aria-hidden />Every file type is accepted. Programs are stored safely and never opened by the server.</p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* Send to friends                                                                                 */
/* ---------------------------------------------------------------------------------------------- */

const CHAT_PHASES = [
  { name: "ask", ms: 1300 },
  { name: "typing", ms: 900 },
  { name: "sending", ms: 1500 },
  { name: "sent", ms: 1100 },
  { name: "seen", ms: 900 },
  { name: "reply", ms: 2600 },
] as const;
type ChatPhase = (typeof CHAT_PHASES)[number]["name"];
const ORDER: ChatPhase[] = CHAT_PHASES.map((p) => p.name);
const atLeast = (p: ChatPhase, q: ChatPhase) => ORDER.indexOf(p) >= ORDER.indexOf(q);

function ChatDemo() {
  const { ref, phase } = usePhases<ChatPhase>(CHAT_PHASES, "reply");
  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[400px]" role="img" aria-label="Illustration: a chat where a friend asks for trip photos and receives a file">
      <div aria-hidden className="absolute -inset-10 -z-10 rounded-[60px] bg-[radial-gradient(55%_55%_at_50%_45%,rgb(47_140_255/0.35),transparent_70%)] blur-2xl" />
      <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#0f1b3d] shadow-[0_30px_80px_-30px_rgb(0_0_0/0.6)]">
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <Avatar value="avatar:lilac-bunny" seed="priya" size={36} />
          <div className="min-w-0 flex-1"><p className="text-[14px] font-semibold text-white">Priya</p><p className="text-[11px] text-white/55">@priya_k</p></div>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[10.5px] text-white/80"><Radio className="h-3 w-3" aria-hidden />Nearby &amp; apps</span>
        </div>
        <div className="min-h-[300px] space-y-2.5 bg-[radial-gradient(rgb(255_255_255/0.06)_1px,transparent_1px)] [background-size:18px_18px] px-4 py-4">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start">
            <div className="max-w-[78%] rounded-2xl rounded-bl-md bg-white/10 px-3.5 py-2 text-[13.5px] text-white">Can you send me the Goa trip photos? 📸</div>
          </motion.div>
          <AnimatePresence mode="popLayout">
            {phase === "typing" && (
              <motion.div key="drag" initial={{ opacity: 0, x: 60, y: 30, rotate: 6 }} animate={{ opacity: 1, x: 0, y: 0, rotate: 0 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.8, ease }} className="flex justify-end">
                <div className="relative flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[12px] text-white shadow-lg">
                  <FileArchive className="h-4 w-4 text-amber-300" aria-hidden />Goa-trip-photos.zip
                  <MousePointer2 className="absolute -bottom-4 -left-3 h-5 w-5 fill-white text-[#0B1E4D]" aria-hidden />
                </div>
              </motion.div>
            )}
            {atLeast(phase, "sending") && (
              <motion.div key="file" layout initial={{ opacity: 0, y: 12, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 380, damping: 28 }} className="flex justify-end">
                <div className="w-[230px] overflow-hidden rounded-2xl rounded-br-md bg-gradient-to-br from-[#2F8CFF] to-[#1E4FD8] text-white shadow-[0_10px_30px_-12px_#2F8CFF]">
                  <div className="flex items-center gap-3 p-3">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/20"><FileArchive className="h-4 w-4" aria-hidden /></span>
                    <span className="min-w-0"><span className="block truncate text-[12.5px] font-medium">Goa-trip-photos.zip</span><span className="block text-[10.5px] text-white/70">84 MB</span></span>
                  </div>
                  <div className="px-3 pb-2.5">
                    {phase === "sending" ? (
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/25"><motion.div className="h-full rounded-full bg-white" initial={{ width: "5%" }} animate={{ width: "100%" }} transition={{ duration: 1.3, ease: "easeInOut" }} /></div>
                    ) : (
                      <p className="flex items-center justify-end gap-1 text-[10.5px] text-white/80">
                        9:41 PM {atLeast(phase, "seen") ? <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}><CheckCheck className="h-3.5 w-3.5 text-white" aria-label="Seen" /></motion.span> : <Check className="h-3.5 w-3.5" aria-label="Sent" />}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
            {phase === "seen" && (
              <motion.div key="dots" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex justify-start">
                <div className="flex gap-1 rounded-2xl rounded-bl-md bg-white/10 px-3.5 py-3">
                  {[0, 1, 2].map((d) => <motion.span key={d} className="h-1.5 w-1.5 rounded-full bg-white/70" animate={{ y: [0, -3, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: d * 0.12 }} />)}
                </div>
              </motion.div>
            )}
            {phase === "reply" && (
              <motion.div key="reply" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex justify-start">
                <div className="max-w-[78%] rounded-2xl rounded-bl-md bg-white/10 px-3.5 py-2 text-[13.5px] text-white">Got them, thank you! 🙌</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="flex items-center gap-2 border-t border-white/10 p-3">
          <span className="flex-1 rounded-xl bg-white/[0.07] px-3 py-2 text-[12px] text-white/45">Write a message, or drop files here</span>
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[#2F8CFF] to-[#1E4FD8] text-white"><Send className="h-3.5 w-3.5" aria-hidden /></span>
        </div>
      </div>
    </div>
  );
}

/** Two devices with radar rings: sharing to people close by through the phone's share sheet. */
function NearbyRadar() {
  return (
    <div aria-hidden className="relative flex h-24 items-center justify-between overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] px-6">
      <span className="relative grid h-12 w-12 place-items-center rounded-xl bg-white/10 text-white">
        {[0, 0.8, 1.6].map((d) => <motion.span key={d} className="absolute inset-0 rounded-xl border border-[#7fb2ff]" animate={{ scale: [1, 2.4], opacity: [0.7, 0] }} transition={{ duration: 2.4, repeat: Infinity, delay: d, ease: "easeOut" }} />)}
        <Smartphone className="h-6 w-6" />
      </span>
      <div className="relative mx-4 h-px flex-1 bg-gradient-to-r from-[#7fb2ff]/0 via-[#7fb2ff]/60 to-[#7fb2ff]/0">
        <motion.span className="absolute -top-2.5 grid h-5 w-5 place-items-center rounded-md bg-[#2F8CFF] text-white shadow-[0_0_14px_#2F8CFF]" animate={{ left: ["0%", "92%"], opacity: [0, 1, 1, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.6 }}>
          <FileImage className="h-3 w-3" />
        </motion.span>
      </div>
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/10 text-white"><Laptop className="h-6 w-6" /></span>
    </div>
  );
}

const FRIEND_POINTS = [
  { icon: UserPlus, title: "Add friends by username", text: "Every account has a unique username. Send a request; chatting starts once they accept." },
  { icon: Send, title: "Drag files into the chat", text: "Or drop them onto a friend's name. They can open and download it straight away." },
  { icon: Ban, title: "You stay in control", text: "Stop sharing any file at any time, remove a friend, or block someone." },
  { icon: Link2, title: "Nearby & other apps", text: "Not on Share Files AI? Use your phone's share sheet: WhatsApp, Gmail, Quick Share or AirDrop." },
];

export function FriendsShowcase() {
  return (
    <section id="friends" aria-labelledby="friends-h" className="relative scroll-mt-20 overflow-hidden bg-[#0B1E4D] py-24 text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(800px_400px_at_85%_0%,rgb(47_140_255/0.28),transparent_70%),radial-gradient(600px_400px_at_0%_100%,rgb(139_92_246/0.18),transparent_70%)]" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-[1fr_1.05fr]">
        <div>
          <Reveal>
            <p className="eyebrow !text-[#93c5fd]">Send to friends</p>
            <h2 id="friends-h" className="mt-2 text-[28px] font-semibold tracking-[-0.025em] sm:text-[36px]">Sharing should feel like <span className="bg-gradient-to-r from-[#7fb2ff] via-[#2F8CFF] to-[#c4b5fd] bg-clip-text text-transparent">sending a message</span></h2>
            <p className="mt-3 text-[15.5px] leading-relaxed text-[#cbd5e1]">Each friend is a private chat. Talk, drop in files of any size and type, and see when they've been opened. No links floating around.</p>
          </Reveal>
          <Stagger className="mt-8 grid gap-3 sm:grid-cols-2" gap={0.08}>
            {FRIEND_POINTS.map((p) => (
              <Item key={p.title}>
                <motion.div whileHover={{ y: -3 }} className="h-full rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#2F8CFF]/20 text-[#93c5fd]"><p.icon className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden /></span>
                  <h3 className="mt-3 text-[15px] font-semibold">{p.title}</h3>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-[#cbd5e1]">{p.text}</p>
                </motion.div>
              </Item>
            ))}
          </Stagger>
          <Reveal delay={0.1} className="mt-4">
            <NearbyRadar />
            <p className="mt-2 text-[12px] text-white/50">Nearby sharing uses your device's Quick Share / Nearby Share (Android) or AirDrop (Apple), over Bluetooth and Wi-Fi.</p>
          </Reveal>
        </div>
        <Reveal delay={0.1}>
          <ChatDemo />
        </Reveal>
      </div>
    </section>
  );
}
