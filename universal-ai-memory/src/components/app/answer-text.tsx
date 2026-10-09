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
        ? <button key={`${keyPrefix}-${i++}`} type="button" onClick={() => onCite(n)} className="mx-0.5 -translate-y-0.5 rounded-md bg-accent/20 px-1.5 text-[11px] font-semibold text-accent hover:bg-accent/30" aria-label={`Source ${n}`}>{n}</button>
        : tok);
    }
    last = m.index! + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function AnswerText({ text, citations, onCite }: { text: string; citations: number[]; onCite: (n: number) => void }) {
  const valid = new Set(citations);
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="prose-answer text-[15px]">
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        const bullets = lines.every((l) => /^\s*[-*•]\s+/.test(l));
        const numbered = lines.every((l) => /^\s*\d+[.)]\s+/.test(l));
        if (bullets) return <ul key={bi}>{lines.map((l, li) => <li key={li}>{inline(l.replace(/^\s*[-*•]\s+/, ""), valid, onCite, `${bi}-${li}`)}</li>)}</ul>;
        if (numbered) return <ol key={bi}>{lines.map((l, li) => <li key={li}>{inline(l.replace(/^\s*\d+[.)]\s+/, ""), valid, onCite, `${bi}-${li}`)}</li>)}</ol>;
        return <p key={bi}>{lines.map((l, li) => <Fragment key={li}>{li > 0 && <br />}{inline(l, valid, onCite, `${bi}-${li}`)}</Fragment>)}</p>;
      })}
    </div>
  );
}
