import { describe, expect, it } from "vitest";
import { interpretHeuristic, mergeAiInterpretation, parseDateRange } from "@/lib/retrieval/interpret";

const NOW = new Date("2026-10-09T10:00:00Z");
const interp = (q: string) => interpretHeuristic(q, { now: NOW });

describe("interpretHeuristic", () => {
  it("extracts sender, type, date and topic from the flagship example", () => {
    const r = interp("Find the PDF Rahul sent me about machine learning last month.");
    expect(r.sender).toBe("Rahul");
    expect(r.mimeTypes).toEqual(["application/pdf"]);
    expect(r.dateRange?.label).toBe("last month");
    expect(r.dateRange?.from).toBe("2026-09-01T00:00:00.000Z");
    expect(r.dateRange?.to).toBe("2026-10-01T00:00:00.000Z");
    expect(r.terms).toEqual(["machine", "learning"]);
    expect(r.intent).toBe("find");
    expect(r.personal).toBe(true);
  });

  it("does not turn generic people into senders", () => {
    const r = interp("What laptop did my friend recommend?");
    expect(r.sender).toBeNull();
    expect(r.terms).toContain("laptop");
    expect(r.personal).toBe(true);
  });

  it("recognises names that start the sentence when followed by a sharing verb", () => {
    expect(interp("Priya Nair shared the budget spreadsheet").sender).toBe("Priya Nair");
    expect(interp("Find files from Arjun about the project").sender).toBe("Arjun");
  });

  it("does not mistake question words or months for names", () => {
    expect(interp("Find invoices from March").sender).toBeNull();
    expect(interp("Find the invoice I uploaded").sender).toBeNull();
  });

  it("detects intents", () => {
    expect(interp("Summarize everything I have saved about AI agents").intent).toBe("summarize");
    expect(interp("Compare these two research papers").intent).toBe("compare");
    expect(interp("Find duplicate files").intent).toBe("duplicates");
    expect(interp("Explain what I have collected about neural networks").intent).toBe("explain");
    expect(interp("Show what I saved recently").intent).toBe("recent");
  });

  it("detects explicit sources and file kinds", () => {
    expect(interp("anything from whatsapp about the trip").sources).toEqual(["whatsapp"]);
    expect(interp("Find the screenshot containing my college timetable").fileCategories).toEqual(["image"]);
    expect(interp("the spreadsheet with budget").mimeTypes?.[0]).toContain("spreadsheetml");
  });

  it("resolves ordinal and pronoun references for follow-ups", () => {
    expect(interp("Summarize the second PDF").refs).toEqual([{ kind: "ordinal", index: 1, fileType: "pdf" }]);
    const r = interp("Compare it with the first one");
    expect(r.refs).toEqual(expect.arrayContaining([{ kind: "ordinal", index: 0 }, { kind: "pronoun" }]));
    expect(interp("Summarize the last document").refs).toEqual([{ kind: "ordinal", index: -1, fileType: "document" }]);
  });

  it("keeps topic words and drops filler", () => {
    expect(interp("What did I learn about artificial intelligence last month?").terms).toEqual(["artificial", "intelligence"]);
    expect(interp("Show me everything related to my final-year project").terms).toEqual(["final-year"]);
  });

  it("caps terms and ignores empty input safely", () => {
    expect(interp("").terms).toEqual([]);
    expect(interp("word ".repeat(50).replace(/word/g, (_, i) => `w${i}x`)).terms.length).toBeLessThanOrEqual(12);
  });
});

describe("parseDateRange", () => {
  it("handles relative phrases", () => {
    expect(parseDateRange("yesterday", NOW)?.from).toBe("2026-10-08T00:00:00.000Z");
    const r = parseDateRange("uploaded three weeks ago", NOW)!;
    expect(new Date(r.from!) < new Date("2026-09-18T00:00:00Z")).toBe(true);
    expect(new Date(r.to!) > new Date("2026-09-18T00:00:00Z")).toBe(true);
    expect(parseDateRange("past 10 days", NOW)?.from).toBe("2026-09-29T00:00:00.000Z");
  });
  it("handles named months (future month names mean last year) and years", () => {
    expect(parseDateRange("in august", NOW)?.from).toBe("2026-08-01T00:00:00.000Z");
    expect(parseDateRange("in december", NOW)?.from).toBe("2025-12-01T00:00:00.000Z");
    expect(parseDateRange("from 2024", NOW)?.to).toBe("2025-01-01T00:00:00.000Z");
  });
  it("respects the user's timezone for day boundaries", () => {
    // IST is UTC+5:30 -> getTimezoneOffset() = -330. 2026-10-09 10:00Z is 15:30 local on the 9th.
    const r = parseDateRange("today", NOW, -330)!;
    expect(r.from).toBe("2026-10-08T18:30:00.000Z");
  });
  it("returns null when there is no date phrase", () => {
    expect(parseDateRange("neural networks", NOW)).toBeNull();
  });
});

describe("mergeAiInterpretation", () => {
  it("returns the heuristic reading when the AI result is missing", () => {
    const base = interp("find invoice");
    expect(mergeAiInterpretation(base, null)).toBe(base);
  });
  it("uses AI terms but sanitises them, and ignores invalid dates", () => {
    const base = interp("laptop my friend recommended");
    const merged = mergeAiInterpretation(base, {
      search_terms: ["laptop", "'; drop table x; --", "x"],
      date_from: "not a date",
    });
    expect(merged.terms).toContain("laptop");
    expect(merged.terms.every((t) => !/[;']/.test(t))).toBe(true);
    expect(merged.dateRange).toBeNull();
  });
  it("AI cannot remove an explicit sender, only add one", () => {
    const withSender = interp("PDF Rahul sent me");
    expect(mergeAiInterpretation(withSender, { sender: "Someone Else" }).sender).toBe("Rahul");
    const without = interp("the PDF about taxes");
    expect(mergeAiInterpretation(without, { sender: "Meera" }).sender).toBe("Meera");
    expect(mergeAiInterpretation(without, { sender: "friend" }).sender).toBeNull();
  });
});
