import { decodeEntities, normalizeWhitespace, truncate } from "./text";

export interface PageMeta {
  title: string | null;
  description: string | null;
  siteName: string | null;
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? decodeEntities(m[2] ?? m[3] ?? m[4] ?? "").trim() : null;
}

export function extractPageMeta(html: string): PageMeta {
  const head = html.slice(0, 200_000);
  const metas: Record<string, string> = {};
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = (attr(tag, "property") ?? attr(tag, "name"))?.toLowerCase();
    const content = attr(tag, "content");
    if (key && content && !(key in metas)) metas[key] = content;
  }
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head);
  const title = metas["og:title"] ?? metas["twitter:title"] ?? (titleTag ? decodeEntities(titleTag[1]!.replace(/<[^>]+>/g, "")).trim() : null);
  return {
    title: title ? truncate(normalizeWhitespace(title), 300) || null : null,
    description: truncate(metas["og:description"] ?? metas["description"] ?? metas["twitter:description"] ?? "", 600) || null,
    siteName: truncate(metas["og:site_name"] ?? "", 120) || null,
  };
}

/** Visible-ish text from HTML. This is for indexing only; the result is never rendered as HTML. */
export function htmlToText(html: string): string {
  const withoutBlocks = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1>/gi, " ");
  const withBreaks = withoutBlocks
    .replace(/<\/(p|div|section|article|li|tr|h[1-6]|blockquote|pre)>/gi, "\n\n")
    .replace(/<(br|hr)\s*\/?>/gi, "\n");
  return normalizeWhitespace(decodeEntities(withBreaks.replace(/<[^>]+>/g, " ")));
}
