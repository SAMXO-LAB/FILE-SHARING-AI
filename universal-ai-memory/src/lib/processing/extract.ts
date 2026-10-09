import { unzipSync, type UnzipFileFilter } from "fflate";
import { htmlToText } from "./html";
import { decodeEntities, decodeText, normalizeWhitespace } from "./text";
import type { TextPage } from "./chunk";

export type ExtractKind = "pdf" | "docx" | "xlsx" | "pptx" | "text" | "csv" | "json" | "xml" | "html";

export interface Extraction {
  pages: TextPage[];
  pageCount: number | null;
  /** Human-readable notes shown on the file (e.g. "No text layer found"). */
  notes: string[];
}

/** An expected, user-explainable failure (encrypted, corrupt, unsupported). */
export class ExtractionError extends Error {
  constructor(message: string, public code: "encrypted" | "corrupt" | "unsupported" | "empty" = "corrupt") {
    super(message);
  }
}

const MAX_ZIP_ENTRY = 60 * 1024 * 1024;
const MAX_ZIP_TOTAL = 150 * 1024 * 1024;

/** Unzip selected entries with zip-bomb protection (declared sizes are checked before inflating). */
export function readZipEntries(data: Uint8Array, want: (name: string) => boolean): Record<string, Uint8Array> {
  let total = 0;
  const filter: UnzipFileFilter = (f) => {
    if (!want(f.name)) return false;
    if (f.originalSize > MAX_ZIP_ENTRY) throw new ExtractionError("The document contains an unusually large part and was not opened.", "unsupported");
    total += f.originalSize;
    if (total > MAX_ZIP_TOTAL) throw new ExtractionError("The document expands to an unsafe size and was not opened.", "unsupported");
    return true;
  };
  try {
    return unzipSync(data, { filter });
  } catch (e) {
    if (e instanceof ExtractionError) throw e;
    throw new ExtractionError("The file is damaged or is not a valid Office document.");
  }
}

const xmlText = (b: Uint8Array) => decodeText(b);

function paragraphsFrom(xml: string, para: RegExp, run: RegExp): string[] {
  const out: string[] = [];
  for (const p of xml.matchAll(para)) {
    const body = p[0]
      .replace(/<w:tab\s*\/>/g, "<w:t>\t</w:t>")
      .replace(/<(w:br|w:cr)\s*\/>/g, "<w:t>\n</w:t>");
    let line = "";
    for (const r of body.matchAll(run)) line += decodeEntities(r[1] ?? "");
    if (line.trim()) out.push(line);
  }
  return out;
}

function extractDocx(data: Uint8Array): Extraction {
  const files = readZipEntries(data, (n) => /^word\/(document|footnotes|endnotes)\.xml$/.test(n));
  const main = files["word/document.xml"];
  if (!main) throw new ExtractionError("This doesn't look like a Word document (no word/document.xml).");
  const parts = [xmlText(main), files["word/footnotes.xml"] ? xmlText(files["word/footnotes.xml"]) : ""];
  const lines = parts.flatMap((x) => paragraphsFrom(x, /<w:p[ >][\s\S]*?<\/w:p>/g, /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g));
  return { pages: [{ page: null, text: lines.join("\n\n") }], pageCount: null, notes: [] };
}

function extractPptx(data: Uint8Array): Extraction {
  const files = readZipEntries(data, (n) => /^ppt\/(slides|notesSlides)\/[^/]+\.xml$/.test(n));
  const slideNums = Object.keys(files)
    .map((n) => /^ppt\/slides\/slide(\d+)\.xml$/.exec(n)?.[1])
    .filter((x): x is string => Boolean(x))
    .map(Number)
    .sort((a, b) => a - b);
  if (slideNums.length === 0) throw new ExtractionError("No slides were found in this presentation.");
  const pages: TextPage[] = slideNums.map((n) => {
    const slide = paragraphsFrom(xmlText(files[`ppt/slides/slide${n}.xml`]!), /<a:p>[\s\S]*?<\/a:p>|<a:p [\s\S]*?<\/a:p>/g, /<a:t>([^<]*)<\/a:t>/g);
    const notesFile = files[`ppt/notesSlides/notesSlide${n}.xml`];
    const notes = notesFile ? paragraphsFrom(xmlText(notesFile), /<a:p>[\s\S]*?<\/a:p>|<a:p [\s\S]*?<\/a:p>/g, /<a:t>([^<]*)<\/a:t>/g) : [];
    return { page: n, text: [...slide, ...(notes.length ? ["Speaker notes:", ...notes] : [])].join("\n\n") };
  });
  return { pages, pageCount: slideNums.length, notes: [] };
}

function colIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function extractXlsx(data: Uint8Array): Extraction {
  const files = readZipEntries(
    data,
    (n) => n === "xl/sharedStrings.xml" || n === "xl/workbook.xml" || n === "xl/_rels/workbook.xml.rels" || /^xl\/worksheets\/[^/]+\.xml$/.test(n),
  );
  const shared: string[] = [];
  if (files["xl/sharedStrings.xml"]) {
    for (const si of xmlText(files["xl/sharedStrings.xml"]).matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      let s = "";
      for (const t of si[1]!.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)) s += decodeEntities(t[1] ?? "");
      shared.push(s);
    }
  }
  const rels = new Map<string, string>();
  if (files["xl/_rels/workbook.xml.rels"]) {
    for (const r of xmlText(files["xl/_rels/workbook.xml.rels"]).matchAll(/<Relationship\b[^>]*>/g)) {
      const id = /Id="([^"]+)"/.exec(r[0])?.[1];
      const target = /Target="([^"]+)"/.exec(r[0])?.[1];
      if (id && target) rels.set(id, target.replace(/^\//, "").replace(/^(?!xl\/)/, "xl/"));
    }
  }
  const sheets: { name: string; path: string }[] = [];
  if (files["xl/workbook.xml"]) {
    for (const s of xmlText(files["xl/workbook.xml"]).matchAll(/<sheet\b[^>]*>/g)) {
      const name = decodeEntities(/name="([^"]*)"/.exec(s[0])?.[1] ?? "Sheet");
      const rid = /r:id="([^"]+)"/.exec(s[0])?.[1];
      const path = rid ? rels.get(rid) : undefined;
      if (path) sheets.push({ name, path });
    }
  }
  if (sheets.length === 0) {
    Object.keys(files).filter((n) => n.startsWith("xl/worksheets/")).sort().forEach((p, i) => sheets.push({ name: `Sheet${i + 1}`, path: p }));
  }
  if (sheets.length === 0) throw new ExtractionError("No worksheets were found in this spreadsheet.");

  const MAX_ROWS = 5000;
  const pages: TextPage[] = [];
  sheets.forEach((sheet, i) => {
    const bytes = files[sheet.path];
    if (!bytes) return;
    const xml = xmlText(bytes);
    const lines: string[] = [`Sheet: ${sheet.name}`];
    let rows = 0;
    for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      if (rows++ >= MAX_ROWS) {
        lines.push(`… (sheet truncated after ${MAX_ROWS} rows)`);
        break;
      }
      const cells: string[] = [];
      for (const c of row[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1] ?? "";
        const inner = c[2] ?? "";
        const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1] ?? "A1";
        const type = /t="([^"]+)"/.exec(attrs)?.[1];
        let val = "";
        if (type === "s") val = shared[Number(/<v>([^<]*)<\/v>/.exec(inner)?.[1])] ?? "";
        else if (type === "inlineStr") val = decodeEntities([...inner.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map((m) => m[1]).join(""));
        else val = decodeEntities(/<v>([^<]*)<\/v>/.exec(inner)?.[1] ?? "");
        if (val !== "") {
          const idx = colIndex(ref);
          while (cells.length < idx) cells.push("");
          cells[idx] = val;
        }
      }
      if (cells.some(Boolean)) lines.push(cells.join("\t"));
    }
    pages.push({ page: i + 1, text: lines.join("\n") });
  });
  return { pages, pageCount: pages.length, notes: ["Each worksheet is indexed as a page."] };
}

async function extractPdf(data: Uint8Array): Promise<Extraction> {
  const { getDocumentProxy, extractText } = await import("unpdf");
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(data));
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === "PasswordException") throw new ExtractionError("This PDF is password-protected, so its text can't be read.", "encrypted");
    throw new ExtractionError("This PDF is damaged or uses an unsupported format.");
  }
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages: TextPage[] = (text as string[]).map((t, i) => ({ page: i + 1, text: normalizeWhitespace(t) }));
  const chars = pages.reduce((n, p) => n + p.text.length, 0);
  const notes: string[] = [];
  if (chars < 20 * Math.max(1, Math.min(totalPages, 5))) {
    notes.push("No text layer was found. This looks like a scanned PDF; OCR for PDFs isn't available, so only the file name and metadata are searchable.");
  }
  return { pages, pageCount: totalPages, notes };
}

function extractJson(text: string): string {
  // Jupyter notebooks: index cell sources, not output blobs.
  try {
    const j = JSON.parse(text) as { cells?: { cell_type?: string; source?: string | string[] }[] };
    if (j && Array.isArray(j.cells)) {
      return j.cells
        .map((c) => `${c.cell_type === "markdown" ? "" : "# code\n"}${Array.isArray(c.source) ? c.source.join("") : (c.source ?? "")}`)
        .join("\n\n");
    }
    // Generic JSON: index string values and keys, which is what people search for.
    const parts: string[] = [];
    const walk = (v: unknown, key?: string, depth = 0) => {
      if (parts.length > 20000 || depth > 12) return;
      if (typeof v === "string") parts.push(key ? `${key}: ${v}` : v);
      else if (typeof v === "number" || typeof v === "boolean") parts.push(key ? `${key}: ${v}` : String(v));
      else if (Array.isArray(v)) v.forEach((x) => walk(x, key, depth + 1));
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k, depth + 1);
    };
    walk(j);
    return parts.join("\n");
  } catch {
    return text; // not valid JSON: index it as plain text
  }
}

export async function extractText(kind: ExtractKind, data: Uint8Array, maxChars: number): Promise<Extraction> {
  let result: Extraction;
  switch (kind) {
    case "pdf": result = await extractPdf(data); break;
    case "docx": result = extractDocx(data); break;
    case "pptx": result = extractPptx(data); break;
    case "xlsx": result = extractXlsx(data); break;
    case "html": result = { pages: [{ page: null, text: htmlToText(decodeText(data)) }], pageCount: null, notes: [] }; break;
    case "xml": result = { pages: [{ page: null, text: normalizeWhitespace(decodeEntities(decodeText(data).replace(/<[^>]+>/g, " "))) }], pageCount: null, notes: [] }; break;
    case "json": result = { pages: [{ page: null, text: normalizeWhitespace(extractJson(decodeText(data))) }], pageCount: null, notes: [] }; break;
    case "csv":
    case "text": result = { pages: [{ page: null, text: normalizeWhitespace(decodeText(data)) }], pageCount: null, notes: [] }; break;
    default: throw new ExtractionError("This file type can't be read for text.", "unsupported");
  }
  // Cap total size so a huge file can't blow up the index.
  let remaining = maxChars;
  let truncated = false;
  const capped: TextPage[] = [];
  for (const p of result.pages) {
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    if (p.text.length > remaining) truncated = true;
    capped.push({ page: p.page, text: p.text.slice(0, remaining) });
    remaining -= p.text.length;
  }
  if (truncated) result.notes.push(`Only the first ${maxChars.toLocaleString()} characters were indexed.`);
  result.pages = capped.filter((p) => p.text.trim().length > 0);
  return result;
}

/** Best-effort media duration for MP4/MOV (mvhd box). Returns seconds or null. */
export function mp4DurationSeconds(b: Uint8Array): number | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const read4cc = (o: number) => String.fromCharCode(b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!);
  const scan = (start: number, end: number, depth: number): number | null => {
    let o = start;
    while (o + 8 <= end) {
      let size = dv.getUint32(o);
      const type = read4cc(o + 4);
      let header = 8;
      if (size === 1 && o + 16 <= end) {
        size = Number(dv.getBigUint64(o + 8));
        header = 16;
      } else if (size === 0) size = end - o;
      if (size < header) return null;
      if (type === "mvhd" && o + header + 20 <= end) {
        const version = b[o + header]!;
        if (version === 1 && o + header + 32 <= end) {
          const timescale = dv.getUint32(o + header + 20);
          const duration = Number(dv.getBigUint64(o + header + 24));
          return timescale ? duration / timescale : null;
        }
        const timescale = dv.getUint32(o + header + 12);
        const duration = dv.getUint32(o + header + 16);
        return timescale ? duration / timescale : null;
      }
      if (type === "moov" && depth < 2) {
        const inner = scan(o + header, Math.min(o + size, end), depth + 1);
        if (inner !== null) return inner;
      }
      o += size;
    }
    return null;
  };
  try {
    return scan(0, b.length, 0);
  } catch {
    return null;
  }
}
