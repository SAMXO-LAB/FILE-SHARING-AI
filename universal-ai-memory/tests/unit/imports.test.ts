import { describe, expect, it } from "vitest";
import { parseWhatsAppExport, whatsappTitleFromFilename, detectDateOrder } from "@/lib/imports/whatsapp";
import { parseTelegramExport, TelegramExportError } from "@/lib/imports/telegram-export";

const ANDROID = `12/31/23, 9:41 PM - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.
12/31/23, 9:41 PM - Rahul Sharma: Happy new year!
12/31/23, 9:42 PM - Priya: Thanks 🎉
Let's catch up soon
and talk about the ML course
1/1/24, 10:05 AM - Rahul Sharma: IMG-20240101-WA0001.jpg (file attached)
Look at this diagram
1/1/24, 10:06 AM - Rahul Sharma: <Media omitted>
1/1/24, 10:07 AM - Priya: This message was deleted
1/1/24, 10:08 AM - Priya added Meera
`;

const IOS = `‎[31/12/2023, 21:41:05] Rahul: Machine learning notes: https://example.com/ml
‎[31/12/2023, 21:42:10] Priya: ‎<attached: 00000012-DOC-2023.pdf>
[01/01/2024, 09:00:00] Rahul: ok
[01/01/2024, 09:00:00] Rahul: ok
`;

describe("parseWhatsAppExport", () => {
  it("parses Android exports: multi-line messages, system lines, attachments, deletions", () => {
    const r = parseWhatsAppExport(ANDROID, { tzOffsetMinutes: 0, dateOrder: "mdy" });
    expect(r.messages).toHaveLength(7);
    expect(r.participants.sort()).toEqual(["Priya", "Rahul Sharma"]);

    const [sys, hello, thanks, attach, omitted, deleted, added] = r.messages.slice(0, 7);
    expect(sys!.kind).toBe("system");
    expect(sys!.sender).toBeNull();
    expect(hello).toMatchObject({ sender: "Rahul Sharma", body: "Happy new year!", kind: "text" });
    expect(hello!.sentAt?.toISOString()).toBe("2023-12-31T21:41:00.000Z");
    expect(thanks!.body).toBe("Thanks 🎉\nLet's catch up soon\nand talk about the ML course");
    expect(attach).toMatchObject({ kind: "media", attachmentName: "IMG-20240101-WA0001.jpg", body: "Look at this diagram" });
    expect(omitted).toMatchObject({ kind: "media", attachmentName: null });
    expect(deleted!.kind).toBe("deleted");
    expect(added!.kind).toBe("system");
  });

  it("parses iOS exports with LRM marks, bracketed dates and 24h clock; detects dd/mm from day > 12", () => {
    const r = parseWhatsAppExport(IOS, { tzOffsetMinutes: 0 });
    expect(r.dateOrder).toBe("dmy");
    expect(r.dateOrderAmbiguous).toBe(false);
    expect(r.messages[0]!.sentAt?.toISOString()).toBe("2023-12-31T21:41:05.000Z");
    expect(r.messages[1]).toMatchObject({ kind: "media", attachmentName: "00000012-DOC-2023.pdf", sender: "Priya" });
  });

  it("gives identical messages distinct but stable de-duplication keys", () => {
    const a = parseWhatsAppExport(IOS);
    const b = parseWhatsAppExport(IOS);
    const [ok1, ok2] = a.messages.slice(2);
    expect(ok1!.dedupeKey).not.toBe(ok2!.dedupeKey);
    expect(a.messages.map((m) => m.dedupeKey)).toEqual(b.messages.map((m) => m.dedupeKey));
    // a longer re-export that contains the same early messages produces the same keys for them
    const longer = parseWhatsAppExport(IOS + "[02/01/2024, 09:00:00] Priya: later\n");
    expect(longer.messages.slice(0, 4).map((m) => m.dedupeKey)).toEqual(a.messages.map((m) => m.dedupeKey));
  });

  it("applies the selected time zone", () => {
    const ist = parseWhatsAppExport("[31/12/2023, 21:41:05] A: hi", { tzOffsetMinutes: -330 });
    expect(ist.messages[0]!.sentAt?.toISOString()).toBe("2023-12-31T16:11:05.000Z");
  });

  it("flags ambiguous date order instead of silently guessing", () => {
    const r = parseWhatsAppExport("01/02/24, 10:00 - A: hi\n03/04/24, 10:00 - B: yo");
    expect(r.dateOrderAmbiguous).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/day\/month or month\/day/);
    const forced = parseWhatsAppExport("01/02/24, 10:00 - A: hi", { dateOrder: "mdy" });
    expect(forced.messages[0]!.sentAt?.getUTCMonth()).toBe(0); // January
  });

  it("keeps messages with unparseable timestamps (no date) and reports them", () => {
    const r = parseWhatsAppExport("31/02/2024, 10:00 - A: impossible date\n01/03/2024, 10:00 - A: fine");
    expect(r.unparsedTimestamps).toBe(1);
    expect(r.messages[0]!.sentAt).toBeNull();
    expect(r.messages).toHaveLength(2);
    expect(r.warnings.join(" ")).toMatch(/could not be read/);
  });

  it("returns no messages for text that is not a WhatsApp export", () => {
    expect(parseWhatsAppExport("hello world\nthis is just a note").messages).toHaveLength(0);
    expect(parseWhatsAppExport("").messages).toHaveLength(0);
  });

  it("is robust against hostile input", () => {
    const evil = "[99/99/9999, 99:99] x: y\n" + "\u0000".repeat(1000) + "\n" + "a".repeat(200_000);
    expect(() => parseWhatsAppExport(evil)).not.toThrow();
  });

  it("derives conversation titles from export file names", () => {
    expect(whatsappTitleFromFilename("WhatsApp Chat with Rahul Sharma.txt")).toBe("Rahul Sharma");
    expect(whatsappTitleFromFilename("WhatsApp Chat - Family group.txt")).toBe("Family group");
    expect(whatsappTitleFromFilename("_chat.txt")).toBe("_chat");
  });

  it("detectDateOrder handles yyyy-mm-dd", () => {
    expect(detectDateOrder(["2024-01-31"]).order).toBe("ymd");
  });
});

describe("parseTelegramExport", () => {
  const single = {
    name: "ML study group",
    type: "private_supergroup",
    id: 1234,
    messages: [
      { id: 1, type: "service", date: "2024-01-01T10:00:00", date_unixtime: "1704103200", actor: "Rahul", action: "create_group", text: "" },
      { id: 2, type: "message", date_unixtime: "1704103260", from: "Rahul", from_id: "user1", text: "Check the paper" },
      { id: 3, type: "message", date_unixtime: "1704103320", from: "Priya", text: [{ type: "link", text: "https://arxiv.org/abs/1" }, " is great"] },
      { id: 4, type: "message", date_unixtime: "1704103380", from: "Rahul", file: "files/paper.pdf", file_name: "paper.pdf", media_type: "document", text: "" },
      { id: 5, type: "message", date_unixtime: "1704103440", from: "Rahul", file: "(File not included. Change data exporting settings to download.)", media_type: "video_file", text: "" },
    ],
  };

  it("parses single-chat exports with rich text, files and service messages", () => {
    const [chat] = parseTelegramExport(JSON.stringify(single));
    expect(chat!.title).toBe("ML study group");
    expect(chat!.messages).toHaveLength(5);
    expect(chat!.messages[0]!.kind).toBe("system");
    expect(chat!.messages[2]!.body).toBe("https://arxiv.org/abs/1 is great");
    expect(chat!.messages[3]).toMatchObject({ kind: "media", attachmentPath: "files/paper.pdf", attachmentName: "paper.pdf" });
    // media that Telegram did not include is not treated as an importable attachment
    expect(chat!.messages[4]).toMatchObject({ kind: "media", attachmentPath: null });
    expect(chat!.messages[1]!.sentAt?.toISOString()).toBe("2024-01-01T10:01:00.000Z");
    expect(chat!.participants.sort()).toEqual(["Priya", "Rahul"]);
  });

  it("parses full-account exports", () => {
    const chats = parseTelegramExport(JSON.stringify({ chats: { list: [single, { ...single, id: 99, name: "Other", messages: [single.messages[1]] }] } }));
    expect(chats.map((c) => c.title)).toEqual(["ML study group", "Other"]);
  });

  it("fails safely with actionable errors", () => {
    expect(() => parseTelegramExport("<html>not json</html>")).toThrow(TelegramExportError);
    expect(() => parseTelegramExport("<html>not json</html>")).toThrow(/JSON/);
    expect(() => parseTelegramExport("{}")).toThrow(/No messages/);
    expect(() => parseTelegramExport("[1,2]")).toThrow(TelegramExportError);
    expect(() => parseTelegramExport("null")).toThrow(TelegramExportError);
  });

  it("produces unique, stable dedupe keys", () => {
    const [a] = parseTelegramExport(JSON.stringify(single));
    const [b] = parseTelegramExport(JSON.stringify(single));
    expect(new Set(a!.messages.map((m) => m.dedupeKey)).size).toBe(a!.messages.length);
    expect(a!.messages.map((m) => m.dedupeKey)).toEqual(b!.messages.map((m) => m.dedupeKey));
  });
});
