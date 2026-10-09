import { z } from "zod";
import { errors, must, route } from "@/lib/api";
import { rehydrateCards } from "@/lib/retrieval/cards";
import { idParams } from "@/lib/validation";

type P = { id: string };

export const GET = route<undefined, undefined, P>({}, async ({ supabase, user, params }) => {
  const { id } = idParams.parse(params);
  const { data: collection } = await supabase.from("collections").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle();
  must(collection);
  const { data: items, error } = await supabase
    .from("collection_items").select("id,file_id,link_id,note_id,conversation_id,added_at").eq("collection_id", id).eq("owner_id", user.id)
    .order("added_at", { ascending: false }).limit(1000);
  if (error) throw error;
  const refs = (items ?? []).map((i) => {
    if (i.file_id) return { type: "file" as const, id: i.file_id as string };
    if (i.link_id) return { type: "link" as const, id: i.link_id as string };
    if (i.note_id) return { type: "note" as const, id: i.note_id as string };
    return { type: "conversation" as const, id: i.conversation_id as string };
  });
  // Cards are rebuilt through RLS, so trashed or deleted items simply don't appear.
  const cards = await rehydrateCards(supabase, refs.slice(0, 200));
  return { collection, cards, itemCount: refs.length };
});

const patch = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).nullable(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
  })
  .partial()
  .strict();

export const PATCH = route<z.infer<typeof patch>, undefined, P>({ body: patch }, async ({ body, supabase, user, params }) => {
  const { id } = idParams.parse(params);
  if (Object.keys(body).length === 0) throw errors.badRequest("Nothing to update.");
  const { data, error } = await supabase.from("collections").update(body).eq("id", id).eq("owner_id", user.id).select("*").maybeSingle();
  if (error) {
    if (error.code === "23505") throw errors.conflict("You already have a collection with that name.");
    throw error;
  }
  return { collection: must(data) };
});

/** Deletes the collection only; the items in it are untouched. */
export const DELETE = route<undefined, undefined, P>({}, async ({ supabase, user, params }) => {
  const { id } = idParams.parse(params);
  const { error } = await supabase.from("collections").delete().eq("id", id).eq("owner_id", user.id);
  if (error) throw error;
  return { ok: true };
});
