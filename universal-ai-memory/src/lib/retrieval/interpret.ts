/**
 * Query interpretation: turn a natural-language question into search terms and filters.
 *
 * A deterministic interpreter always runs (works with no AI, and is the fallback). When an AI
 * provider is allowed, its structured reading refines the result; everything it returns is
 * validated, and anything invalid is discarded in favour of the deterministic reading.
 */
import { z } from "zod";

export type Intent = "find" | "summarize" | "compare" | "explain" | "duplicates" | "recent" | "question";

export interface DateRange {
  from: string | null; // ISO, inclusive
  to: string | null; // ISO, exclusive
  label: string;
}

export interface ItemRef {
  kind: "ordinal" | "pronoun";
  /** 0-based index for ordinals ("the second pdf" -> 1); -1 means "last". */
  index?: number;
  fileType?: string;
}

export interface Interpretation {
  intent: Intent;
  terms: string[];
  sender: string | null;
  dateRange: DateRange | null;
  mimeTypes: string[] | null;
  fileCategories: string[] | null;
  sources: string[] | null;
  /** True if the question refers to the user's own stuff (so "no results" must not fall back to general knowledge). */
  personal: boolean;
  refs: ItemRef[];
  /** Human-readable summary of what was understood, shown to the user as removable filter chips. */
  chips: { kind: "sender" | "date" | "type" | "source"; label: string }[];
}

const STOP = new Set(`a about above after again all also am an and any are as at be been before being below between both but by can could did do does doing down during each few find for from further get give had has have having he her here hers herself him himself his how i if in into is it its itself just let me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should show so some such than that the their theirs them themselves then there these they this those through to too under until up us very was we were what when where which while who whom why will with would you your yours yourself list tell see look looking want need please can't cant dont don't lets everything anything something related relevant stuff things thing one ones latest`.split(/\s+/));

// Words that describe the *action* or *container* rather than the topic.
const META = new Set(`file files document documents doc docs pdf pdfs image images photo photos picture pictures screenshot screenshots video videos audio voice message messages chat chats conversation conversations link links article articles note notes saved save collected collect uploaded upload upload imported import sent send shared share recommend recommended recommendation learn learned learnt discuss discussed discussion talked talk mentioned mention summarize summarise summary compare explain explained containing contain contains called named name original source sources whatsapp telegram last month week year yesterday today ago recent recently material materials collection project projects`.split(/\s+/));

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const ORDINALS: Record<string, number> = {
  first: 0, "1st": 0, second: 1, "2nd": 1, third: 2, "3rd": 2, fourth: 3, "4th": 3, fifth: 4, "5th": 4, last: -1,
};

const GENERIC_PEOPLE = new Set(["friend", "friends", "someone", "somebody", "colleague", "teacher", "professor", "mom", "dad", "boss", "brother", "sister", "classmate", "client", "everyone", "anyone", "people", "he", "she", "they", "me", "you", "us"]);
const NOT_NAMES = new Set(["Find", "Show", "What", "Where", "When", "Which", "Who", "Why", "How", "Summarize", "Summarise", "Compare", "Explain", "List", "Give", "Tell", "Get", "Search", "Open", "I", "My", "The", "A", "An", "This", "That", "These", "Those", "It", "Is", "Are", "Can", "Could", "Do", "Does", "Did", "Please", "Everything", "All", "Any", "PDF", "WhatsApp", "Telegram", "Last", "Yesterday", "Today", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Summary", "AI", "ML", "Python", "JavaScript", "TypeScript"]);

const startOfDay = (d: Date, tz: number) => {
  // tz = minutes offset such that local = utc - tz*60000 (same sign as Date.getTimezoneOffset()).
  const local = new Date(d.getTime() - tz * 60000);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() + tz * 60000);
};
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

export function parseDateRange(text: string, now: Date, tzOffsetMinutes = 0): DateRange | null {
  const t = text.toLowerCase();
  const today = startOfDay(now, tzOffsetMinutes);
  const tomorrow = addDays(today, 1);
  const iso = (d: Date) => d.toISOString();
  const mk = (from: Date | null, to: Date | null, label: string): DateRange => ({ from: from ? iso(from) : null, to: to ? iso(to) : null, label });

  if (/\btoday\b/.test(t)) return mk(today, tomorrow, "today");
  if (/\byesterday\b/.test(t)) return mk(addDays(today, -1), today, "yesterday");
  if (/\b(this|current) week\b/.test(t)) {
    const dow = (new Date(today.getTime() - tzOffsetMinutes * 60000).getUTCDay() + 6) % 7; // Monday=0
    return mk(addDays(today, -dow), tomorrow, "this week");
  }
  if (/\blast week\b/.test(t)) {
    const dow = (new Date(today.getTime() - tzOffsetMinutes * 60000).getUTCDay() + 6) % 7;
    const thisMonday = addDays(today, -dow);
    return mk(addDays(thisMonday, -7), thisMonday, "last week");
  }
  const localNow = new Date(now.getTime() - tzOffsetMinutes * 60000);
  const y = localNow.getUTCFullYear();
  const m = localNow.getUTCMonth();
  const monthStart = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 1) + tzOffsetMinutes * 60000);
  if (/\b(this|current) month\b/.test(t)) return mk(monthStart(y, m), tomorrow, "this month");
  if (/\blast month\b/.test(t)) return mk(monthStart(m === 0 ? y - 1 : y, (m + 11) % 12), monthStart(y, m), "last month");
  if (/\b(this|current) year\b/.test(t)) return mk(monthStart(y, 0), tomorrow, "this year");
  if (/\blast year\b/.test(t)) return mk(monthStart(y - 1, 0), monthStart(y, 0), "last year");

  const rel = /\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(day|week|month|year)s?\s+ago\b/.exec(t);
  if (rel) {
    const n = /^\d+$/.test(rel[1]!) ? parseInt(rel[1]!, 10) : (NUMBER_WORDS[rel[1]!] ?? 1);
    const unit = rel[2]!;
    const days = unit === "day" ? n : unit === "week" ? n * 7 : unit === "month" ? n * 30 : n * 365;
    const slack = unit === "day" ? 1 : unit === "week" ? 4 : unit === "month" ? 15 : 60;
    const centre = addDays(today, -days);
    return mk(addDays(centre, -slack), addDays(centre, slack + 1), `about ${rel[0]}`);
  }
  const past = /\b(?:past|last|previous)\s+(\d+|two|three|four|five|six|seven|eight|nine|ten)\s+(day|week|month)s\b/.exec(t);
  if (past) {
    const n = /^\d+$/.test(past[1]!) ? parseInt(past[1]!, 10) : (NUMBER_WORDS[past[1]!] ?? 1);
    const days = past[2] === "day" ? n : past[2] === "week" ? n * 7 : n * 30;
    return mk(addDays(today, -days), tomorrow, `past ${n} ${past[2]}s`);
  }
  const lastDay = new RegExp(`\\blast (${WEEKDAYS.join("|")})\\b`).exec(t);
  if (lastDay) {
    const target = WEEKDAYS.indexOf(lastDay[1]!);
    const cur = new Date(today.getTime() - tzOffsetMinutes * 60000).getUTCDay();
    const diff = ((cur - target + 7) % 7) || 7;
    const day = addDays(today, -diff);
    return mk(day, addDays(day, 1), `last ${lastDay[1]}`);
  }
  const monthName = new RegExp(`\\b(?:in|during|from|on)?\\s*(${MONTHS.join("|")})(?:\\s+(\\d{4}))?\\b`).exec(t);
  if (monthName && /\b(in|during|from|of)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/.test(t)) {
    const mi = MONTHS.indexOf(monthName[1]!);
    let yy = monthName[2] ? parseInt(monthName[2], 10) : y;
    if (!monthName[2] && mi > m) yy = y - 1; // a future month name means last year's
    return mk(monthStart(yy, mi), monthStart(mi === 11 ? yy + 1 : yy, (mi + 1) % 12), `${monthName[1]} ${yy}`);
  }
  const yearOnly = /\b(?:in|during|from|of)\s+((?:19|20)\d{2})\b/.exec(t);
  if (yearOnly) {
    const yy = parseInt(yearOnly[1]!, 10);
    return mk(monthStart(yy, 0), monthStart(yy + 1, 0), String(yy));
  }
  return null;
}

function detectTypes(t: string): { mime: string[] | null; categories: string[] | null; label: string | null } {
  const has = (re: RegExp) => re.test(t);
  if (has(/\bpdfs?\b/)) return { mime: ["application/pdf"], categories: null, label: "PDF" };
  if (has(/\b(word doc(ument)?s?|docx)\b/)) return { mime: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"], categories: null, label: "Word" };
  if (has(/\b(spreadsheets?|excel|xlsx)\b/)) return { mime: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], categories: null, label: "Spreadsheet" };
  if (has(/\b(powerpoint|pptx|slides?|slide decks?|presentations?)\b/)) return { mime: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"], categories: null, label: "Presentation" };
  if (has(/\b(screenshots?|photos?|pictures?|images?|diagrams?)\b/)) return { mime: null, categories: ["image"], label: "Images" };
  if (has(/\bvideos?\b/)) return { mime: null, categories: ["video"], label: "Videos" };
  if (has(/\b(audio|voice notes?|recordings?)\b/)) return { mime: null, categories: ["audio"], label: "Audio" };
  return { mime: null, categories: null, label: null };
}

function detectIntent(t: string): Intent {
  if (/\bduplicates?\b/.test(t)) return "duplicates";
  if (/\bcompare\b|\bdifference between\b|\bvs\.?\b|\bversus\b/.test(t)) return "compare";
  if (/\b(summari[sz]e|summary|tl;?dr|overview of|study guide)\b/.test(t)) return "summarize";
  if (/\b(explain|what is|what are|how does|how do|why)\b/.test(t)) return "explain";
  if (/\b(what did i (save|learn|collect|discuss)|what have i|what do i have)\b/.test(t)) return "question";
  if (/\b(saved|uploaded|added)\s+recently\b|\brecently (saved|added|uploaded)\b|\bwhat i saved recently\b|\bshow (me )?(what i )?saved\b/.test(t)) return "recent";
  if (/\b(find|show|search|locate|where|which|list|open|look for)\b/.test(t)) return "find";
  return "question";
}

function detectSender(q: string): string | null {
  const name = "([\\p{Lu}][\\p{L}'’-]+(?:\\s+[\\p{Lu}][\\p{L}'’-]+)?)";
  const patterns = [
    new RegExp(`\\b(?:from|by)\\s+${name}`, "u"),
    new RegExp(`${name}\\s+(?:sent|shared|recommended|told|messaged|wrote|mentioned|said|forwarded|gave|texted)\\b`, "u"),
    new RegExp(`\\b(?:sent|shared|forwarded)\\s+(?:to me\\s+)?by\\s+${name}`, "u"),
  ];
  for (const re of patterns) {
    const m = re.exec(q);
    if (!m) continue;
    const parts = m[1]!.split(/\s+/).filter((p) => !NOT_NAMES.has(p));
    const cand = parts.join(" ").trim();
    if (cand && !GENERIC_PEOPLE.has(cand.toLowerCase())) return cand;
  }
  // "my friend Rahul recommended" handled above; "friend recommend" has no capitalised name -> null.
  return null;
}

function detectSources(t: string): string[] | null {
  const out: string[] = [];
  if (/\bwhats ?app\b/.test(t)) out.push("whatsapp");
  if (/\btelegram\b/.test(t)) out.push("telegram");
  if (/\bsaved (links?|articles?)\b|\bbookmarks?\b/.test(t)) out.push("link");
  return out.length ? out : null;
}

function detectRefs(t: string): ItemRef[] {
  const refs: ItemRef[] = [];
  const re = /\b(?:the\s+)?(first|second|third|fourth|fifth|last|1st|2nd|3rd|4th|5th)\s+(?:one|pdf|file|document|doc|image|photo|link|result|note|message|conversation|paper)\b/g;
  for (const m of t.matchAll(re)) {
    const noun = /(?:one|pdf|file|document|doc|image|photo|link|result|note|message|conversation|paper)$/.exec(m[0])?.[0];
    refs.push({ kind: "ordinal", index: ORDINALS[m[1]!], fileType: noun && noun !== "one" && noun !== "result" ? noun : undefined });
  }
  if (/\b(it|this|that|them|these|those|the above|the same)\b/.test(t) && /\b(summari[sz]e|compare|explain|open|show|tell|what|how|more|details|about|with)\b/.test(t)) {
    refs.push({ kind: "pronoun" });
  }
  return refs;
}

function personalMarkers(t: string): boolean {
  return /\b(my|mine|i|i've|ive|i'd|me|we|our|uploaded|saved|collected|imported|sent|shared|received|conversation|conversations|chat|chats|whatsapp|telegram|notes?|files?|documents?|screenshots?|photos?|pdfs?|links?|collection|project|invoice|timetable|memory)\b/.test(t);
}

export function extractTerms(q: string, extraStop: Set<string> = new Set()): string[] {
  const tokens = q.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’+#.-]*/gu) ?? [];
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const raw of tokens) {
    const tok = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").replace(/['’]s$/, "");
    if (tok.length < 2) continue;
    if (STOP.has(tok) || META.has(tok) || extraStop.has(tok)) continue;
    if (/^\d+(st|nd|rd|th)$/.test(tok) || tok in ORDINALS || tok in NUMBER_WORDS) continue;
    if (MONTHS.includes(tok) || WEEKDAYS.includes(tok)) continue;
    if (/^\d{1,2}$/.test(tok)) continue;
    if (seen.has(tok)) continue;
    seen.add(tok);
    terms.push(tok);
  }
  return terms.slice(0, 12);
}

export function interpretHeuristic(question: string, opts: { now?: Date; tzOffsetMinutes?: number } = {}): Interpretation {
  const now = opts.now ?? new Date();
  const tz = opts.tzOffsetMinutes ?? 0;
  const q = question.trim().slice(0, 1000);
  const t = q.toLowerCase();

  const dateRange = parseDateRange(t, now, tz);
  const sender = detectSender(q);
  const types = detectTypes(t);
  const sources = detectSources(t);

  const extraStop = new Set<string>();
  if (sender) sender.toLowerCase().split(/\s+/).forEach((p) => extraStop.add(p));

  const chips: Interpretation["chips"] = [];
  if (sender) chips.push({ kind: "sender", label: `From ${sender}` });
  if (dateRange) chips.push({ kind: "date", label: dateRange.label });
  if (types.label) chips.push({ kind: "type", label: types.label });
  if (sources) sources.forEach((s) => chips.push({ kind: "source", label: s === "link" ? "Saved links" : s[0]!.toUpperCase() + s.slice(1) }));

  return {
    intent: detectIntent(t),
    terms: extractTerms(q, extraStop),
    sender,
    dateRange,
    mimeTypes: types.mime,
    fileCategories: types.categories,
    sources,
    personal: personalMarkers(t),
    refs: detectRefs(t),
    chips,
  };
}

// ---------------------------------------------------------------------------------------------
// AI refinement (validated)
// ---------------------------------------------------------------------------------------------
export const aiInterpretationSchema = z.object({
  intent: z.enum(["find", "summarize", "compare", "explain", "duplicates", "recent", "question"]).optional(),
  search_terms: z.array(z.string().min(1).max(60)).max(12).optional(),
  sender: z.string().max(60).nullable().optional(),
  date_from: z.string().max(40).nullable().optional(),
  date_to: z.string().max(40).nullable().optional(),
  file_types: z.array(z.enum(["pdf", "word", "spreadsheet", "presentation", "image", "video", "audio", "text"])).max(4).optional(),
  sources: z.array(z.enum(["whatsapp", "telegram", "link", "upload", "note"])).max(4).optional(),
  personal: z.boolean().optional(),
});
export type AiInterpretation = z.infer<typeof aiInterpretationSchema>;

const TYPE_TO_MIME: Record<string, { mime?: string[]; categories?: string[] }> = {
  pdf: { mime: ["application/pdf"] },
  word: { mime: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"] },
  spreadsheet: { mime: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"] },
  presentation: { mime: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"] },
  image: { categories: ["image"] },
  video: { categories: ["video"] },
  audio: { categories: ["audio"] },
  text: { mime: ["text/plain", "text/markdown"] },
};

export function mergeAiInterpretation(base: Interpretation, ai: AiInterpretation | null): Interpretation {
  if (!ai) return base;
  const out: Interpretation = { ...base, chips: [...base.chips] };
  if (ai.intent) out.intent = ai.intent;
  if (ai.search_terms?.length) {
    const cleaned = ai.search_terms
      .flatMap((s) => s.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’+#.-]*/gu) ?? [])
      .map((s) => s.replace(/[^\p{L}\p{N}+#]+$/gu, ""))
      .filter((s) => s.length >= 2 && s.length <= 60);
    if (cleaned.length) out.terms = [...new Set(cleaned)].slice(0, 12);
  }
  if (ai.personal !== undefined) out.personal = ai.personal || base.personal;
  // The AI may *add* a sender; it cannot remove an explicit one detected from the text.
  if (!out.sender && ai.sender && ai.sender.trim()) {
    const s = ai.sender.trim();
    if (!GENERIC_PEOPLE.has(s.toLowerCase())) {
      out.sender = s;
      out.chips.push({ kind: "sender", label: `From ${s}` });
    }
  }
  if (!out.dateRange && (ai.date_from || ai.date_to)) {
    const from = ai.date_from ? new Date(ai.date_from) : null;
    const to = ai.date_to ? new Date(ai.date_to) : null;
    const okFrom = from && !Number.isNaN(+from) ? from : null;
    const okTo = to && !Number.isNaN(+to) ? to : null;
    if ((okFrom || okTo) && (!okFrom || !okTo || okFrom < okTo)) {
      out.dateRange = { from: okFrom?.toISOString() ?? null, to: okTo?.toISOString() ?? null, label: "date range" };
      out.chips.push({ kind: "date", label: "Date range" });
    }
  }
  if (!out.mimeTypes && !out.fileCategories && ai.file_types?.length) {
    const mimes = ai.file_types.flatMap((t) => TYPE_TO_MIME[t]?.mime ?? []);
    const cats = ai.file_types.flatMap((t) => TYPE_TO_MIME[t]?.categories ?? []);
    if (mimes.length && !cats.length) out.mimeTypes = mimes;
    else if (cats.length && !mimes.length) out.fileCategories = cats;
    if (out.mimeTypes || out.fileCategories) out.chips.push({ kind: "type", label: ai.file_types.join(", ") });
  }
  if (!out.sources && ai.sources?.length) {
    const allowed = ai.sources.filter((s) => s === "whatsapp" || s === "telegram" || s === "link");
    if (allowed.length) out.sources = allowed;
  }
  return out;
}
