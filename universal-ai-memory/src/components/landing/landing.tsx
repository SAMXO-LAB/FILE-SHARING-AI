"use client";
import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { useState } from "react";
import {
  ArrowRight, AudioLines, Bot, Brain, ChevronDown, Clock3, Eye, FileSpreadsheet, FileText, FolderLock, Image as ImageIcon, KeyRound,
  Layers, Link2, Lock, Menu, MessageCircle, MousePointerClick, NotebookPen, Presentation, Quote, Search, Send, Share2, ShieldCheck, Sparkles, Trash2, UploadCloud, X,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { HeroDemo } from "./hero-demo";
import { DragDropShowcase, FriendsShowcase } from "./showcases";
import { Item, LandingMotion, Reveal, Stagger, fadeUp, stagger } from "./motion";

const NAV = [
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
  { href: "#friends", label: "Friends" },
  { href: "#privacy", label: "Privacy" },
  { href: "#faq", label: "FAQ" },
];

export function Landing() {
  return (
    <LandingMotion>
      <div className="relative min-h-dvh overflow-x-clip">
        <Backdrop />
        <TopBar />
        <main id="main">
          <Hero />
          <Sources />
          <HowItWorks />
          <DragDropShowcase />
          <Features />
          <FriendsShowcase />
          <AskShowcase />
          <Privacy />
          <Faq />
          <FinalCta />
        </main>
        <Footer />
      </div>
    </LandingMotion>
  );
}

const MotionLink = motion.create(Link);

/** Sign in / sign up links: lift on hover, squish on press, and a light sweep on click. */
function AuthLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return (
    <MotionLink href={href} className={`press-shine relative overflow-hidden ${className ?? ""}`} whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }} transition={{ type: "spring", stiffness: 500, damping: 26 }}>
      {children}
    </MotionLink>
  );
}

/* ---------------------------------------------------------------------------------------------- */

function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[900px] overflow-hidden">
      <motion.div className="absolute -top-40 left-1/2 h-[620px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--accent)_14%,transparent),transparent)]" animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }} />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgb(var(--line)/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(var(--line)/0.04)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]" />
    </div>
  );
}

function TopBar() {
  const [open, setOpen] = useState(false);
  const { scrollY } = useScroll();
  const shadow = useTransform(scrollY, [0, 40], ["0 0 0 rgb(0 0 0 / 0)", "0 1px 0 rgb(15 23 42 / 0.06)"]);
  return (
    <motion.header style={{ boxShadow: shadow }} className="sticky top-0 z-40 bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] backdrop-blur-xl" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5 }}>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center rounded-lg" aria-label="Share Files AI home"><Logo size="sm" /></Link>
        <nav aria-label="Sections" className="hidden flex-1 items-center gap-1 md:flex">
          {NAV.map((n) => <a key={n.href} href={n.href} className="rounded-lg px-3 py-1.5 text-[14px] text-muted transition-colors hover:bg-[rgb(var(--line)/0.045)] hover:text-fg">{n.label}</a>)}
        </nav>
        <div className="ml-auto hidden items-center gap-2 md:flex">
          <AuthLink href="/login" className="rounded-lg px-3 py-1.5 text-[14px] font-medium text-fg transition-colors hover:bg-[rgb(var(--line)/0.045)]">Sign in</AuthLink>
          <AuthLink href="/signup" className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-accent px-4 text-[14px] font-medium text-white shadow-[0_4px_12px_-4px_color-mix(in_srgb,var(--accent)_55%,transparent)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_88%,black)]">Get started<ArrowRight className="h-4 w-4" aria-hidden /></AuthLink>
        </div>
        <button className="ml-auto grid h-9 w-9 place-items-center rounded-lg hover:bg-[rgb(var(--line)/0.05)] md:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
      </div>
      {open && (
        <motion.nav aria-label="Sections" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="border-t hairline bg-card px-4 pb-4 pt-2 md:hidden">
          {NAV.map((n) => <a key={n.href} href={n.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-[15px] text-fg hover:bg-[rgb(var(--line)/0.045)]">{n.label}</a>)}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <AuthLink href="/login" className="grid h-10 place-items-center rounded-[10px] border hairline text-[14px] font-medium">Sign in</AuthLink>
            <AuthLink href="/signup" className="grid h-10 place-items-center rounded-[10px] bg-accent text-[14px] font-medium text-white">Get started</AuthLink>
          </div>
        </motion.nav>
      )}
    </motion.header>
  );
}

/* ---------------------------------------------------------------------------------------------- */

function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-20">
      <motion.div initial="hidden" animate="show" variants={stagger(0.1, 0.1)}>
        <motion.p variants={fadeUp} className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent-soft px-3 py-1 text-[12.5px] font-medium text-accent">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />Your files, links and chats in one searchable place
        </motion.p>
        <motion.h1 variants={fadeUp} className="mt-5 text-[40px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[56px]">
          Ask your files <span className="bg-gradient-to-r from-accent to-[#0ea5e9] bg-clip-text text-transparent">anything.</span>
        </motion.h1>
        <motion.p variants={fadeUp} className="mt-5 max-w-xl text-[17px] leading-relaxed text-muted">
          Share Files AI keeps your documents, photos, saved links, notes and chat exports in one private place, then answers your questions in plain language, with the exact sources it used.
        </motion.p>
        <motion.div variants={fadeUp} className="mt-8 flex flex-wrap items-center gap-3">
          <AuthLink href="/signup" className="group inline-flex h-12 items-center gap-2 rounded-[12px] bg-accent px-6 text-[15px] font-medium text-white shadow-[0_8px_24px_-8px_color-mix(in_srgb,var(--accent)_60%,transparent)] transition-[background-color,transform] hover:bg-[color-mix(in_srgb,var(--accent)_88%,black)] active:scale-[0.98]">
            Create your account<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </AuthLink>
          <AuthLink href="/login" className="inline-flex h-12 items-center rounded-[12px] border hairline bg-card px-6 text-[15px] font-medium shadow-[var(--shadow-xs)] transition-colors hover:border-[rgb(var(--line)/0.18)]">Sign in</AuthLink>
        </motion.div>
        <motion.ul variants={fadeUp} className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13.5px] text-muted">
          {[{ i: Lock, t: "Private by default" }, { i: Quote, t: "Answers cite their sources" }, { i: UploadCloud, t: "Drag & drop any file" }, { i: Send, t: "Send to friends" }].map(({ i: I, t }) => (
            <li key={t} className="flex items-center gap-1.5"><I className="h-4 w-4 text-accent" aria-hidden />{t}</li>
          ))}
        </motion.ul>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.7, delay: 0.25, ease: [0.2, 0.8, 0.2, 1] }} className="relative mx-auto w-full max-w-[540px]">
        <HeroDemo />
        <p className="mt-3 text-center text-[11.5px] text-subtle">Illustration with sample content</p>
      </motion.div>
    </section>
  );
}

/* ---------------------------------------------------------------------------------------------- */

const SOURCES = [
  { icon: FileText, label: "PDF & Word", tone: "bg-blue-50 text-blue-600" },
  { icon: FileSpreadsheet, label: "Excel & CSV", tone: "bg-emerald-50 text-emerald-600" },
  { icon: Presentation, label: "PowerPoint", tone: "bg-orange-50 text-orange-600" },
  { icon: ImageIcon, label: "Photos & scans", tone: "bg-fuchsia-50 text-fuchsia-600" },
  { icon: AudioLines, label: "Audio & video", tone: "bg-amber-50 text-amber-600" },
  { icon: Link2, label: "Web links", tone: "bg-cyan-50 text-cyan-700" },
  { icon: NotebookPen, label: "Notes", tone: "bg-yellow-50 text-yellow-700" },
  { icon: MessageCircle, label: "WhatsApp exports", tone: "bg-green-50 text-green-600" },
  { icon: Send, label: "Telegram", tone: "bg-sky-50 text-sky-600" },
];

function Sources() {
  const row = [...SOURCES, ...SOURCES];
  return (
    <section aria-labelledby="sources-h" className="border-y hairline bg-card/60 py-14">
      <Reveal className="mx-auto max-w-6xl px-4 text-center sm:px-6">
        <p className="eyebrow">Bring everything in</p>
        <h2 id="sources-h" className="mt-2 text-[26px] font-semibold tracking-[-0.025em] sm:text-[30px]">One home for everything you save</h2>
        <p className="mx-auto mt-2 max-w-2xl text-[15px] text-muted">Drag files anywhere on the page, paste a link, write a note, or import a chat you exported. Text is extracted so you can search inside, not just by file name.</p>
      </Reveal>
      <div className="relative mt-10 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
        <motion.ul className="flex w-max gap-3" animate={{ x: ["0%", "-50%"] }} transition={{ duration: 32, repeat: Infinity, ease: "linear" }} aria-label="Supported content">
          {row.map((s, i) => (
            <li key={i} aria-hidden={i >= SOURCES.length || undefined} className="flex items-center gap-2.5 rounded-xl border hairline bg-card px-4 py-2.5 shadow-[var(--shadow-xs)]">
              <span className={cn("grid h-8 w-8 place-items-center rounded-lg dark:bg-white/10 dark:text-white", s.tone)}><s.icon className="h-4 w-4" aria-hidden /></span>
              <span className="whitespace-nowrap text-[14px] font-medium">{s.label}</span>
            </li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------------------------- */

const STEPS = [
  { icon: UploadCloud, title: "Add anything", text: "Upload files (large ones resume if your connection drops), save links, write notes, or import WhatsApp and Telegram chat exports." },
  { icon: Brain, title: "It gets read and indexed", text: "Text is pulled out of documents, slides and sheets, and optionally from images and recordings, so every page becomes searchable." },
  { icon: Sparkles, title: "Ask in plain language", text: "“Summarize the second PDF”, “what did Priya say about the deposit?” You get an answer with numbered sources and the related files." },
];

function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-h" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
      <Reveal className="text-center">
        <p className="eyebrow">How it works</p>
        <h2 id="how-h" className="mt-2 text-[28px] font-semibold tracking-[-0.025em] sm:text-[34px]">From scattered files to answers in three steps</h2>
      </Reveal>
      <div className="relative mt-14">
        <motion.div aria-hidden className="absolute left-[16.6%] right-[16.6%] top-7 hidden h-px origin-left bg-gradient-to-r from-accent/50 via-accent/30 to-accent/50 md:block" initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 1.1, ease: "easeInOut", delay: 0.2 }} />
        <Stagger as="ol" className="grid gap-10 md:grid-cols-3" gap={0.18}>
          {STEPS.map((s, i) => (
            <Item as="li" key={s.title} className="relative text-center">
              <span className="relative mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-accent/20 bg-card text-accent shadow-[var(--shadow-md)]">
                <s.icon className="h-6 w-6" strokeWidth={1.8} aria-hidden />
                <span className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-accent text-[11px] font-semibold text-white">{i + 1}</span>
              </span>
              <h3 className="mt-5 text-[17px] font-semibold tracking-[-0.01em]">{s.title}</h3>
              <p className="mx-auto mt-2 max-w-xs text-[14.5px] leading-relaxed text-muted">{s.text}</p>
            </Item>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------------------------- */

const FEATURES = [
  { icon: Quote, title: "Answers with sources", text: "Every answer lists the passages it used. Click a number to jump to the exact page or message.", span: "md:col-span-2" },
  { icon: Search, title: "Search by words or meaning", text: "Keyword, date, sender and file-type filters, plus meaning-based search when it's switched on." },
  { icon: FileText, title: "Document assistant", text: "Summaries, key dates and names, comparisons between files, and study guides." },
  { icon: Layers, title: "Collections", text: "Group files, links, notes and chats by project. Summarize or ask about a whole collection.", span: "md:col-span-2" },
  { icon: Share2, title: "Send to friends", text: "Add friends by username and chat: drag files in to send them, stop sharing any time. Or share nearby and to other apps from your phone." },
  { icon: MousePointerClick, title: "Drag and drop anywhere", text: "Drop files, folders, links or text onto any page. Drop onto a folder or collection to file it there." },
  { icon: Bot, title: "Telegram bot", text: "Link the bot and anything you send it, messages or files, is saved to your memory." },
  { icon: Clock3, title: "Timeline", text: "Browse everything you've added by date, newest first." },
  { icon: Sparkles, title: "Blue & white, or dark", text: "A calm interface with light and dark modes, themes and accessible contrast.", span: "md:col-span-2" },
];

function Features() {
  return (
    <section id="features" aria-labelledby="features-h" className="scroll-mt-20 bg-[linear-gradient(to_bottom,transparent,color-mix(in_srgb,var(--accent)_4%,transparent),transparent)] py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="max-w-2xl">
          <p className="eyebrow">Features</p>
          <h2 id="features-h" className="mt-2 text-[28px] font-semibold tracking-[-0.025em] sm:text-[34px]">Everything you need to find things again</h2>
          <p className="mt-3 text-[15.5px] text-muted">Built for people who save a lot and remember where very little of it went.</p>
        </Reveal>
        <Stagger className="mt-12 grid gap-4 md:grid-cols-4" gap={0.06}>
          {FEATURES.map((f) => (
            <Item key={f.title} className={cn("h-full", f.span)}>
              <motion.div whileHover={{ y: -3 }} transition={{ duration: 0.18 }} className="card card-hover h-full p-5">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent"><f.icon className="h-5 w-5" strokeWidth={1.8} aria-hidden /></span>
                <h3 className="mt-4 text-[16px] font-semibold tracking-[-0.01em]">{f.title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{f.text}</p>
              </motion.div>
            </Item>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------------------------- */

const ASKS = [
  "Find the PDF about solar panel quotes",
  "What did we decide in the project chat last month?",
  "Summarize the second one",
  "Compare it with the first",
  "Show the links I saved this week",
  "Make a study guide from my lecture notes",
];

function AskShowcase() {
  return (
    <section aria-labelledby="ask-h" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <Reveal>
          <p className="eyebrow">Ask AI</p>
          <h2 id="ask-h" className="mt-2 text-[28px] font-semibold tracking-[-0.025em] sm:text-[34px]">Talk to your memory like you'd ask a friend</h2>
          <p className="mt-3 text-[15.5px] leading-relaxed text-muted">Follow-ups understand what you just saw, so “the second PDF” or “that chat” just works. When something isn't in your files, it says so instead of making it up.</p>
          <ul className="mt-6 space-y-3 text-[14.5px]">
            {["Answers come only from your own items", "Related files appear as cards you can open", "Save any answer as a note, or export the chat"].map((t) => (
              <li key={t} className="flex items-start gap-2.5"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />{t}</li>
            ))}
          </ul>
        </Reveal>
        <Stagger className="flex flex-wrap gap-2.5" gap={0.07}>
          {ASKS.map((q, i) => (
            <Item key={q}>
              <motion.span whileHover={{ scale: 1.03 }} className={cn("inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-[14px] shadow-[var(--shadow-xs)]", i % 3 === 0 ? "border-accent/20 bg-accent-soft text-fg" : "hairline bg-card text-fg")}>
                <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden />{q}
              </motion.span>
            </Item>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------------------------- */

const PRIVACY = [
  { icon: FolderLock, title: "Private storage", text: "Files live in a private bucket. Previews and downloads use links that expire after a minute." },
  { icon: KeyRound, title: "You choose what AI sees", text: "Four modes: names only, private text search, a self-hosted AI, or cloud AI. Nothing goes to an AI provider unless you switch it on." },
  { icon: Eye, title: "Every person is separate", text: "Database rules make sure nobody can see your items unless you share one explicitly." },
  { icon: Trash2, title: "Leave any time", text: "Download all your data, delete imports, or delete your account and every stored file." },
];

function Privacy() {
  return (
    <section id="privacy" aria-labelledby="privacy-h" className="scroll-mt-20 bg-[#0f172a] py-24 text-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="max-w-2xl">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[#93c5fd]">Privacy</p>
          <h2 id="privacy-h" className="mt-2 text-[28px] font-semibold tracking-[-0.025em] sm:text-[34px]">Your memory stays yours</h2>
          <p className="mt-3 text-[15.5px] leading-relaxed text-[#cbd5e1]">Privacy is the default, not an upgrade. And we're straightforward about the limits.</p>
        </Reveal>
        <Stagger className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" gap={0.08}>
          {PRIVACY.map((p) => (
            <Item key={p.title} className="h-full rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#2563eb]/20 text-[#93c5fd]"><p.icon className="h-5 w-5" strokeWidth={1.8} aria-hidden /></span>
              <h3 className="mt-4 text-[16px] font-semibold">{p.title}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-[#cbd5e1]">{p.text}</p>
            </Item>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------------------------- */

const FAQS = [
  { q: "Can I send files to friends?", a: "Yes. Add friends by their unique username and you each get a private chat: drag files in to send them, and stop sharing any time. For people who aren't on Share Files AI, the share button opens your device's share sheet with WhatsApp, Gmail and the rest, plus Quick Share / Nearby Share or AirDrop for phones and laptops close by." },
  { q: "What can I upload?", a: "Any file type: PDFs, Word, Excel, PowerPoint, OpenDocument, e-books, text and code, images and design files, audio, video, archives and more. Just drag and drop. Text is extracted from documents automatically, and text in images and speech in recordings can be read too when the server has those features enabled. Programs are stored safely but never opened by the server." },
  { q: "How do WhatsApp and Telegram work?", a: "Export a chat from WhatsApp (as .txt or .zip) or from Telegram Desktop (as JSON) and upload it. Importing the same chat again only adds new messages. You can also link the Telegram bot and send it things to save." },
  { q: "Does the AI make things up?", a: "Answers are written only from the items it found in your memory, and each one lists its sources so you can check. If nothing relevant is found, it tells you. Like any AI, it can still be wrong, so the sources are always there." },
  { q: "Do I need an AI provider for it to work?", a: "No. Without one you still get full search and matching passages from your files. Written answers and summaries appear when AI is configured and you allow it in Settings → Privacy." },
  { q: "Who can see my files?", a: "Only you, unless you share a file with a specific person. Shares can expire, can be view-only, and can be revoked at any time." },
  { q: "Can I delete everything?", a: "Yes. You can delete individual items, everything from one import, or your whole account, which removes all stored files. You can download your data first." },
];

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" aria-labelledby="faq-h" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-24 sm:px-6">
      <Reveal className="text-center">
        <p className="eyebrow">FAQ</p>
        <h2 id="faq-h" className="mt-2 text-[28px] font-semibold tracking-[-0.025em] sm:text-[34px]">Questions, answered</h2>
      </Reveal>
      <Stagger className="mt-10 space-y-3" gap={0.06}>
        {FAQS.map((f, i) => {
          const isOpen = open === i;
          return (
            <Item key={f.q} className="card overflow-hidden">
              <h3>
                <button type="button" aria-expanded={isOpen} aria-controls={`faq-${i}`} id={`faq-q-${i}`} onClick={() => setOpen(isOpen ? null : i)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15.5px] font-medium">
                  {f.q}
                  <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}><ChevronDown className="h-5 w-5 text-muted" aria-hidden /></motion.span>
                </button>
              </h3>
              <motion.div id={`faq-${i}`} role="region" aria-labelledby={`faq-q-${i}`} initial={false} animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }} transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }} className="overflow-hidden">
                <p className="px-5 pb-5 text-[14.5px] leading-relaxed text-muted">{f.a}</p>
              </motion.div>
            </Item>
          );
        })}
      </Stagger>
    </section>
  );
}

/* ---------------------------------------------------------------------------------------------- */

function FinalCta() {
  return (
    <section className="px-4 pb-24 sm:px-6">
      <Reveal className="relative mx-auto max-w-5xl overflow-hidden rounded-[28px] bg-gradient-to-br from-[#2563eb] to-[#1d4ed8] px-6 py-14 text-center text-white shadow-[0_24px_60px_-24px_rgb(37_99_235/0.6)] sm:px-12">
        <motion.div aria-hidden className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10" animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }} />
        <motion.div aria-hidden className="absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-white/10" animate={{ scale: [1.1, 1, 1.1] }} transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }} />
        <h2 className="relative text-[28px] font-semibold tracking-[-0.025em] sm:text-[36px]">Stop searching. Start asking.</h2>
        <p className="relative mx-auto mt-3 max-w-xl text-[16px] text-white/85">Create your account, drop in a few files, and ask your first question in under a minute.</p>
        <div className="relative mt-8 flex flex-wrap justify-center gap-3">
          <AuthLink href="/signup" className="inline-flex h-12 items-center gap-2 rounded-[12px] bg-white px-6 text-[15px] font-medium text-[#1d4ed8] shadow-[0_8px_24px_-10px_rgb(0_0_0/0.35)] transition-transform hover:-translate-y-0.5 active:scale-[0.98]">Get started<ArrowRight className="h-4 w-4" aria-hidden /></AuthLink>
          <AuthLink href="/login" className="inline-flex h-12 items-center rounded-[12px] border border-white/30 px-6 text-[15px] font-medium text-white transition-colors hover:bg-white/10">I already have an account</AuthLink>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  const year = new Date().getFullYear();
  return (
    <motion.footer initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="border-t hairline bg-card">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm">
          <Link href="/" className="flex items-center" aria-label="Share Files AI home"><Logo size="md" tagline /></Link>
          <p className="mt-3 text-[14px] leading-relaxed text-muted">Your files, links, notes and chats in one private place, with answers you can trace back to the source.</p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-12 gap-y-2 text-[14px]">
          {NAV.map((n) => <a key={n.href} href={n.href} className="text-muted transition-colors hover:text-fg">{n.label}</a>)}
          <Link href="/login" className="text-muted transition-colors hover:text-fg">Sign in</Link>
          <Link href="/signup" className="text-muted transition-colors hover:text-fg">Create account</Link>
        </nav>
      </div>
      <div className="border-t hairline">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-[13px] text-muted sm:flex-row sm:px-6">
          <p>© {year} Share Files AI</p>
          <p className="flex items-center gap-1.5">Developed by <span className="font-semibold text-fg">Chandrashekar</span></p>
        </div>
      </div>
    </motion.footer>
  );
}

