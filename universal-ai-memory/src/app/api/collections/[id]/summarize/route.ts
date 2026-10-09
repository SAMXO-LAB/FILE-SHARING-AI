import { errors, must, route } from "@/lib/api";
import { loadPolicy } from "@/lib/ai/policy";
import { askAboutItems } from "@/lib/retrieval/answer";
import { idParams } from "@/lib/validation";

const MAX_ITEMS = 4;

export const POST = route<undefined, undefined, { id: string }>({ rateLimit: { name: "collection-summarize", max: 20, windowSeconds: 600 } }, async ({ supabase, user, params }) => {
  const { id } = idParams.parse(params);
  const { data: c } = await supabase.from("collections").select("id,name").eq("id", id).eq("owner_id", user.id).maybeSingle();
  const collection = must(c);
  const { data: items } = await supabase
    .from("collection_items").select("file_id,link_id,note_id,conversation_id").eq("collection_id", id).eq("owner_id", user.id).order("added_at", { ascending: false }).limit(200);
  const refs = (items ?? []).map((i) =>
    i.file_id ? { type: "file" as const, id: i.file_id as string } :
    i.link_id ? { type: "link" as const, id: i.link_id as string } :
    i.note_id ? { type: "note" as const, id: i.note_id as string } :
    { type: "conversation" as const, id: i.conversation_id as string });
  if (refs.length === 0) throw errors.badRequest("This collection is empty.");
  const policy = await loadPolicy(supabase, user.id);
  const result = await askAboutItems(supabase, { question: `Summarize these items from the collection “${collection.name}”`, policy, items: refs });
  if (refs.length > MAX_ITEMS) {
    result.limitations.push(`This collection has ${refs.length} items; the summary covers the ${MAX_ITEMS} most recently added. Ask a specific question to dig into the rest.`);
  }
  return { result };
});
