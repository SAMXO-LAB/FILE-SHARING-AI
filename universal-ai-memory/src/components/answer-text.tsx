"use client";
import { Fragment } from "react";

/**
 * Renders model/backend text safely: only text nodes (never HTML), with light formatting
 * (paragraphs, lists, **bold**, `code`) and [n] markers turned into citation buttons for n that
 * actually exist.
 */
function inline(text: string, valid: Set<number>, onCite: (n: number) => void, keyPrefix: string) {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[\d{1,2}\])/g;
  let last = 0, i = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) parts.push(<strong key={`${keyPrefix}-${i++}`}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) parts.push(<code key={`${keyPrefix}-${i++}`}>{tok.slice(1, -1)}</code>);
    else {
      const n = Number(tok.slice(1, -1));
      parts.push(valid.has(n)
        ? <button key={`${keyPrefix}-${i++}`} type="button" onClick={() => onCite(n)} className="mx-0.5 inline-grid h-[18px] min-w-[18px] -translate-y-px place-items-center rounded-[6px] border border-accent/20 bg-accent-soft px-1 align-middle text-[10.5px] font-semibold leading-none text-accent transition-colors hover:bg-accent hover:text-accent-fg" aria-label={`Source ${n}`}>{n}</button>
        : tok);
    }
    last = m.index! + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/**
 * Text blocks: fenced ``` code, "#" headings, bullet and numbered lists, paragraphs. Everything is
 * rendered as text nodes, so model output can never inject markup.
 */
export function AnswerText({ text, citations, onCite }: { text: string; citations: number[]; onCite: (n: number) => void }) {
  const valid = new Set(citations);
  const normalized = text.replace(/\r\n/g, "\n");
  const segments = normalized.split(/^```[^\n]*\n?/m);
  const out: React.ReactNode[] = [];
  segments.forEach((seg, si) => {
    if (si % 2 === 1) {
      out.push(<pre key={`code-${si}`}><code>{seg.replace(/\n$/, "")}</code></pre>);
      return;
    }
    const blocks = seg.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
    blocks.forEach((block, bi) => {
      const key = `${si}-${bi}`;
      const lines = block.split("\n");
      const heading = lines.length === 1 ? /^(#{1,3})\s+(.*)$/.exec(lines[0]!) : null;
      if (heading) {
        const H = (["h1", "h2", "h3"] as const)[heading[1]!.length - 1]!;
        out.push(<H key={key}>{inline(heading[2]!, valid, onCite, key)}</H>);
        return;
      }
      const bullets = lines.every((l) => /^\s*[-*•]\s+/.test(l));
      const numbered = lines.every((l) => /^\s*\d+[.)]\s+/.test(l));
      if (bullets) { out.push(<ul key={key}>{lines.map((l, li) => <li key={li}>{inline(l.replace(/^\s*[-*•]\s+/, ""), valid, onCite, `${key}-${li}`)}</li>)}</ul>); return; }
      if (numbered) { out.push(<ol key={key}>{lines.map((l, li) => <li key={li}>{inline(l.replace(/^\s*\d+[.)]\s+/, ""), valid, onCite, `${key}-${li}`)}</li>)}</ol>); return; }
      out.push(<p key={key}>{lines.map((l, li) => <Fragment key={li}>{li > 0 && <br />}{inline(l, valid, onCite, `${key}-${li}`)}</Fragment>)}</p>);
    });
  });
  return <div className="prose-answer">{out}</div>;
}
