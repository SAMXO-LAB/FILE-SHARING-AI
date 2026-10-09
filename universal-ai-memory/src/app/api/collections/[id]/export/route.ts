import { must, route } from "@/lib/api";
import { rehydrateCards } from "@/lib/retrieval/cards";
import { idParams } from "@/lib/validation";

const day = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : "unknown date");

/** Exports a collection as a Markdown index: titles, types, dates, link URLs and note text. File bytes are not included. */
export const GET = route<undefined, undefined, { id: string }>({ rateLimit: { name: "collection-export", max: 20, windowSeconds: 600 } }, async ({ supabase, user, params }) => {
  const { id } = idParams.parse(params);
  const { data: c } = await supabase.from("collections").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle();
  const collection = must(c);
  const { data: items } = await supabase.from("collection_items").select("file_id,link_id,note_id,conversation_id").eq("collection_id", id).eq("owner_id", user.id).limit(1000);
  const refs = (items ?? []).map((i) =>
    i.file_id ? { type: "file" as const, id: i.file_id as string } :
    i.link_id ? { type: "link" as const, id: i.link_id as string } :
    i.note_id ? { type: "note" as const, id: i.note_id as string } :
    { type: "conversation" as const, id: i.conversation_id as string });
  const cards = await rehydrateCards(supabase, refs);
  const noteIds = cards.filter((x) => x.type === "note").map((x) => x.id);
  const { data: notes } = noteIds.length ? await supabase.from("notes").select("id,body").in("id", noteIds) : { data: [] };
  const noteBody = new Map((notes ?? []).map((n) => [n.id as string, n.body as string]));

  const lines = [`# ${collection.name}`, ""];
  if (collection.description) lines.push(collection.description, "");
  lines.push(`_Exported ${new Date().toISOString().slice(0, 10)} · ${cards.length} item${cards.length === 1 ? "" : "s"}_`, "");
  for (const card of cards) {
    lines.push(`## ${card.title}`, `- Type: ${card.typeLabel}`, `- Source: ${card.sourceLabel}`, `- ${card.dateKind ?? "date"}: ${day(card.date)}`);
    if (card.url) lines.push(`- URL: ${card.url}`);
    if (card.description) lines.push("", card.description);
    if (card.type === "note") lines.push("", noteBody.get(card.id) ?? "");
    lines.push("");
  }
  const safe = collection.name.replace(/[^\w.-]+/g, "_").slice(0, 60) || "collection";
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safe}.md"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
