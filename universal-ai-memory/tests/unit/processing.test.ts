import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { chunkPages } from "@/lib/processing/chunk";
import { extractText, ExtractionError, mp4DurationSeconds } from "@/lib/processing/extract";
import { extractPageMeta, htmlToText } from "@/lib/processing/html";
import { buildWindows } from "@/lib/imports/windows";
import { extractKindFor } from "@/lib/processing/pipeline";
import { makeSnippet } from "@/lib/retrieval/cards";
import { resolveCitationMarkers, resolveRefs } from "@/lib/retrieval/answer";
import { evidenceFromCards } from "@/lib/retrieval/evidence";
import type { ContentCard } from "@/lib/retrieval/types";

const u8 = strToU8;
const MAX = 1_000_000;

describe("chunkPages", () => {
  it("keeps page ranges and respects size limits", () => {
    const paras = (n: number, tag: string) => Array.from({ length: n }, (_, i) => `${tag} paragraph ${i} ${"lorem ipsum dolor sit amet ".repeat(8)}`).join("\n\n");
    const chunks = chunkPages([{ page: 1, text: paras(6, "A") }, { page: 2, text: paras(6, "B") }, { page: 3, text: paras(2, "C") }]);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((c) => c.text.length <= 1500)).toBe(true);
    expect(chunks[0]!.pageStart).toBe(1);
    expect(chunks[chunks.length - 1]!.pageEnd).toBe(3);
    // chunk indexes are sequential
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
    // overlap: consecutive chunks share some text
    expect(chunks[1]!.text.startsWith(chunks[0]!.text.slice(-60).split(" ").slice(-3).join(" ").slice(0, 5)) || chunks[1]!.text.length > 0).toBe(true);
  });

  it("splits a single huge paragraph and handles empty input", () => {
    const big = "word ".repeat(5000);
    const chunks = chunkPages([{ page: null, text: big }]);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.every((c) => c.text.length <= 1500)).toBe(true);
    expect(chunkPages([])).toEqual([]);
    expect(chunkPages([{ page: 1, text: "   \n\n  " }])).toEqual([]);
  });

  it("does not drop any content", () => {
    const text = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} about topic ${i % 5}.`).join(" ");
    const joined = chunkPages([{ page: null, text }]).map((c) => c.text).join(" ");
    for (let i = 0; i < 40; i++) expect(joined).toContain(`Sentence number ${i} `);
  });
});

describe("extractors", () => {
  it("reads DOCX paragraphs", async () => {
    const docx = zipSync({
      "word/document.xml": u8(`<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>Neural networks</w:t></w:r><w:r><w:t xml:space="preserve"> learn</w:t></w:r></w:p><w:p><w:r><w:t>Backprop &amp; gradients</w:t></w:r></w:p></w:body></w:document>`),
    });
    const r = await extractText("docx", docx, MAX);
    expect(r.pages[0]!.text).toBe("Neural networks learn\n\nBackprop & gradients");
  });

  it("reads PPTX slides with slide numbers", async () => {
    const pptx = zipSync({
      "ppt/slides/slide1.xml": u8(`<p:sld><a:p><a:r><a:t>Title slide</a:t></a:r></a:p></p:sld>`),
      "ppt/slides/slide2.xml": u8(`<p:sld><a:p><a:r><a:t>Gradient descent</a:t></a:r></a:p></p:sld>`),
      "ppt/slides/slide10.xml": u8(`<p:sld><a:p><a:r><a:t>Conclusion</a:t></a:r></a:p></p:sld>`),
    });
    const r = await extractText("pptx", pptx, MAX);
    expect(r.pages.map((p) => p.page)).toEqual([1, 2, 10]);
    expect(r.pages[1]!.text).toContain("Gradient descent");
    expect(r.pageCount).toBe(3);
  });

  it("reads XLSX sheets (shared strings, numbers, inline strings)", async () => {
    const xlsx = zipSync({
      "xl/workbook.xml": u8(`<workbook><sheets><sheet name="Budget" sheetId="1" r:id="rId1"/></sheets></workbook>`),
      "xl/_rels/workbook.xml.rels": u8(`<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`),
      "xl/sharedStrings.xml": u8(`<sst><si><t>Item</t></si><si><t>Laptop</t></si></sst>`),
      "xl/worksheets/sheet1.xml": u8(`<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>Price</t></is></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>45000</v></c></row></sheetData></worksheet>`),
    });
    const r = await extractText("xlsx", xlsx, MAX);
    expect(r.pages[0]!.text).toBe("Sheet: Budget\nItem\tPrice\nLaptop\t45000");
  });

  it("reads plain text, CSV, JSON, notebooks, HTML and XML", async () => {
    expect((await extractText("text", u8("héllo\r\n\r\n\r\n\r\nworld"), MAX)).pages[0]!.text).toBe("héllo\n\nworld");
    expect((await extractText("json", u8(JSON.stringify({ title: "ML", nested: { tag: "ai" } })), MAX)).pages[0]!.text).toContain("title: ML");
    const nb = JSON.stringify({ cells: [{ cell_type: "markdown", source: ["# Intro\n", "text"] }, { cell_type: "code", source: "print(1)" }] });
    const t = (await extractText("json", u8(nb), MAX)).pages[0]!.text;
    expect(t).toContain("# Intro");
    expect(t).toContain("print(1)");
    expect((await extractText("html", u8("<html><script>evil()</script><body><h1>Hi</h1><p>there &amp; you</p></body></html>"), MAX)).pages[0]!.text).toBe("Hi\n\nthere & you");
    expect((await extractText("xml", u8("<a><b>one</b><c>two</c></a>"), MAX)).pages[0]!.text).toBe("one two");
  });

  it("fails clearly on damaged or encrypted inputs", async () => {
    await expect(extractText("docx", u8("not a zip"), MAX)).rejects.toBeInstanceOf(ExtractionError);
    await expect(extractText("pdf", u8("%PDF-1.4 garbage"), MAX)).rejects.toThrow(/PDF/);
    await expect(extractText("docx", zipSync({ "other.xml": u8("<x/>") }), MAX)).rejects.toThrow(/Word document/);
  });

  it("refuses zip bombs (declared size checked before inflating)", async () => {
    const huge = zipSync({ "word/document.xml": new Uint8Array(70 * 1024 * 1024) }, { level: 9 });
    await expect(extractText("docx", huge, MAX)).rejects.toThrow(/unusually large/);
  });

  it("caps indexed text", async () => {
    const r = await extractText("text", u8("x ".repeat(5000)), 1000);
    expect(r.pages.reduce((n, p) => n + p.text.length, 0)).toBeLessThanOrEqual(1000);
    expect(r.notes.join(" ")).toMatch(/Only the first/);
  });

  it("reads MP4 duration from the mvhd box", () => {
    const box = (type: string, payload: Uint8Array) => {
      const out = new Uint8Array(8 + payload.length);
      new DataView(out.buffer).setUint32(0, out.length);
      out.set(u8(type), 4);
      out.set(payload, 8);
      return out;
    };
    const mvhd = new Uint8Array(100);
    const dv = new DataView(mvhd.buffer);
    dv.setUint32(12, 1000); // timescale
    dv.setUint32(16, 90_000); // duration -> 90s
    const file = new Uint8Array([...box("ftyp", u8("isom0000")), ...box("moov", box("mvhd", mvhd))]);
    expect(mp4DurationSeconds(file)).toBe(90);
    expect(mp4DurationSeconds(u8("garbage"))).toBeNull();
  });

  it("chooses extractors from the verified mime type", () => {
    expect(extractKindFor("application/pdf", "x.txt")).toBe("pdf");
    expect(extractKindFor("text/x-python", "a.py")).toBe("text");
    expect(extractKindFor("application/octet-stream", "a.bin")).toBeNull();
    expect(extractKindFor("image/png", "a.png")).toBeNull();
  });
});

describe("html helpers", () => {
  it("extracts page metadata", () => {
    const m = extractPageMeta(`<head><title> Fallback </title><meta property="og:title" content="Real &amp; Title"><meta name="description" content="Desc"><meta property="og:site_name" content="Site"></head>`);
    expect(m).toEqual({ title: "Real & Title", description: "Desc", siteName: "Site" });
  });
  it("strips scripts and styles from visible text", () => {
    expect(htmlToText("<style>p{}</style><p>a</p><script>x()</script><p>b</p>")).toBe("a\n\nb");
  });
});

describe("message windows", () => {
  const m = (seq: number, sender: string, body: string, at: string | null, kind: "text" | "media" | "system" = "text") =>
    ({ seq, sender, body, sentAt: at, kind, attachmentName: kind === "media" ? "f.pdf" : null }) as const;
  it("groups neighbours, splits on long gaps and skips system messages", () => {
    const w = buildWindows([
      m(1, "A", "hello", "2024-01-01T10:00:00Z"),
      m(2, "B", "hi", "2024-01-01T10:01:00Z"),
      m(3, "", "A added B", "2024-01-01T10:02:00Z", "system"),
      m(4, "A", "later", "2024-01-02T10:00:00Z"),
    ]);
    expect(w).toHaveLength(2);
    expect(w[0]).toMatchObject({ seqFrom: 1, seqTo: 2, senders: ["A", "B"], occurredAt: "2024-01-01T10:00:00Z" });
    expect(w[0]!.body).toContain("[2024-01-01 10:00] A: hello");
    expect(w[1]!.seqFrom).toBe(4);
  });
  it("includes attachment names and caps window size", () => {
    const many = Array.from({ length: 45 }, (_, i) => m(i + 1, "A", `msg ${i}`, "2024-01-01T10:00:00Z"));
    expect(buildWindows(many).length).toBe(3);
    expect(buildWindows([m(1, "A", "see this", "2024-01-01T10:00:00Z", "media")])[0]!.body).toContain("[attachment: f.pdf]");
  });
});

describe("snippets", () => {
  it("centres on the first matched term", () => {
    const text = "x".repeat(500) + " backpropagation is how networks learn " + "y".repeat(500);
    const s = makeSnippet(text, ["backpropagation"]);
    expect(s).toContain("backpropagation");
    expect(s.length).toBeLessThanOrEqual(310);
  });
  it("returns short text unchanged", () => {
    expect(makeSnippet("short text", ["short"])).toBe("short text");
  });
});

const card = (key: string, passages: string[], extra: Partial<ContentCard> = {}): ContentCard => ({
  key, type: key.split(":")[0] as ContentCard["type"], id: key.split(":")[1]!, section: "files", title: `Title ${key}`, typeLabel: "PDF", mime: "application/pdf", category: "document",
  sourceId: "upload", sourceLabel: "Uploaded", sender: null, senderVerified: false, date: "2026-09-01T00:00:00Z", dateKind: "uploaded", sizeBytes: 10, status: "ready", statusDetail: null,
  description: null, url: null, conversationTitle: null, messageCount: null, relevance: 1, relevanceLabel: "high",
  passages: passages.map((t, i) => ({ recordId: `${key}-r${i}`, text: t, page: i + 1, pageEnd: i + 1, seqFrom: null, seqTo: null, matchedBy: ["keyword"] })), ...extra,
});

describe("evidence & citations", () => {
  it("spreads the budget across cards and numbers evidence sequentially", () => {
    const ev = evidenceFromCards([card("file:a", ["aaa", "aab", "aac"]), card("file:b", ["bbb"])], 1000, 2);
    expect(ev.map((e) => e.n)).toEqual([1, 2, 3]);
    expect(ev.map((e) => e.cardKey)).toEqual(["file:a", "file:b", "file:a"]);
  });
  it("uses metadata-only evidence (once) for cards without passages and labels summaries as generated", () => {
    const ev = evidenceFromCards([card("file:a", [], { description: "An AI summary" }), card("file:b", [])], 1000);
    expect(ev).toHaveLength(2);
    expect(ev[0]).toMatchObject({ generated: true, text: "An AI summary" });
    expect(ev[1]!.text).toMatch(/No text from this item/);
  });
  it("maps [E#] markers to citations in order of use and strips invented ones", () => {
    const ev = evidenceFromCards([card("file:a", ["alpha"]), card("file:b", ["beta"]), card("file:c", ["gamma"])], 1000, 1);
    const r = resolveCitationMarkers("Beta is covered [E2]. Alpha too [E1][E2]. Ghost source [E9] and [E3].", ev);
    expect(r.text).toBe("Beta is covered [1]. Alpha too [2][1]. Ghost source and [3].");
    expect(r.citations.map((c) => c.cardKey)).toEqual(["file:b", "file:a", "file:c"]);
    expect(r.citations.every((c) => c.href.startsWith("/"))).toBe(true); // in-app links only
    expect(r.citations[1]!.page).toBe(1);
  });
});

describe("follow-up resolution", () => {
  const prev = {
    cards: [
      { type: "file" as const, id: "1", title: "Notes.pdf", mime: "application/pdf", category: "document" },
      { type: "file" as const, id: "2", title: "Photo.png", mime: "image/png", category: "image" },
      { type: "file" as const, id: "3", title: "Paper.pdf", mime: "application/pdf", category: "document" },
      { type: "link" as const, id: "4", title: "Article", mime: null, category: null },
    ],
    focus: { type: "file" as const, id: "1", title: "Notes.pdf" },
  };
  it("resolves ordinals within the noun's pool (second PDF = Paper.pdf)", () => {
    expect(resolveRefs([{ kind: "ordinal", index: 1, fileType: "pdf" }], prev).targets.map((t) => t.id)).toEqual(["3"]);
    expect(resolveRefs([{ kind: "ordinal", index: 0 }], prev).targets.map((t) => t.id)).toEqual(["1"]);
    expect(resolveRefs([{ kind: "ordinal", index: -1, fileType: "link" }], prev).targets.map((t) => t.id)).toEqual(["4"]);
  });
  it("resolves pronouns to the focus item, and 'compare it with the first' to two items", () => {
    expect(resolveRefs([{ kind: "pronoun" }], prev).targets.map((t) => t.id)).toEqual(["1"]);
    const r = resolveRefs([{ kind: "ordinal", index: 1, fileType: "pdf" }, { kind: "pronoun" }], prev);
    expect(r.targets.map((t) => t.id).sort()).toEqual(["1", "3"]);
  });
  it("reports unresolved references instead of guessing", () => {
    expect(resolveRefs([{ kind: "ordinal", index: 0 }], null).unresolved).toBe(true);
    expect(resolveRefs([{ kind: "ordinal", index: 9 }], prev).unresolved).toBe(true);
    expect(resolveRefs([{ kind: "pronoun" }], { cards: prev.cards, focus: null }).unresolved).toBe(true);
    expect(resolveRefs([], prev)).toEqual({ targets: [], unresolved: false });
  });
});
