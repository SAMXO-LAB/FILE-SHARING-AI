export interface TextPage {
  /** 1-based page / slide / sheet number, or null when the format has no pages. */
  page: number | null;
  text: string;
}

export interface Chunk {
  index: number;
  text: string;
  pageStart: number | null;
  pageEnd: number | null;
}

export interface ChunkOptions {
  target?: number;
  max?: number;
  overlap?: number;
}

interface Segment {
  text: string;
  page: number | null;
}

function splitLong(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  // Sentence-aware split, then hard split as a last resort.
  const sentences = text.match(/[^.!?।\n]+[.!?।]+["')\]]*\s*|[^.!?।\n]+$/g) ?? [text];
  const parts: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (s.length > max) {
      if (cur) parts.push(cur), (cur = "");
      for (let i = 0; i < s.length; i += max) parts.push(s.slice(i, i + max));
      continue;
    }
    if ((cur + s).length > max) parts.push(cur), (cur = s);
    else cur += s;
  }
  if (cur) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function tailAtWordBoundary(text: string, size: number): string {
  if (text.length <= size) return text;
  const tail = text.slice(-size);
  const sp = tail.search(/\s/);
  return sp >= 0 ? tail.slice(sp + 1) : tail;
}

/**
 * Splits extracted text into overlapping, paragraph-aware chunks, remembering the page range
 * each chunk came from so citations can point at "p. 12".
 */
export function chunkPages(pages: TextPage[], opts: ChunkOptions = {}): Chunk[] {
  const target = opts.target ?? 900;
  const max = opts.max ?? 1300;
  const overlap = opts.overlap ?? 150;

  const segments: Segment[] = [];
  for (const p of pages) {
    for (const para of p.text.split(/\n{2,}/)) {
      const t = para.trim();
      if (!t) continue;
      for (const piece of splitLong(t, max)) segments.push({ text: piece, page: p.page });
    }
  }

  const chunks: Chunk[] = [];
  let buf = "";
  let pageStart: number | null = null;
  let pageEnd: number | null = null;
  let hasNew = false;

  const flush = () => {
    if (!hasNew) return;
    chunks.push({ index: chunks.length, text: buf.trim(), pageStart, pageEnd });
    const carry = tailAtWordBoundary(buf, overlap);
    buf = carry;
    pageStart = pageEnd; // new chunk starts on the page where the previous ended
    hasNew = false;
  };

  for (const seg of segments) {
    if (buf && buf.length + seg.text.length + 2 > target && hasNew) flush();
    if (!hasNew) pageStart = seg.page;
    buf = buf ? `${buf}\n\n${seg.text}` : seg.text;
    pageEnd = seg.page;
    hasNew = true;
  }
  if (hasNew) chunks.push({ index: chunks.length, text: buf.trim(), pageStart, pageEnd });
  return chunks;
}
