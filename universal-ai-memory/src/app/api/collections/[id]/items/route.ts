import { z } from "zod";
import { errors, must, route } from "@/lib/api";
import { idParams } from "@/lib/validation";

type P = { id: string };
const COLUMN = { file: "file_id", link: "link_id", note: "note_id", conversation: "conversation_id" } as const;
const itemSchema = z.object({ type: z.enum(["file", "link", "note", "conversation"]), id: z.uuid() });

export const POST = route<{ items: z.infer<typeof itemSchema>[] }, undefined, P>(
  { body: z.object({ items: z.array(itemSchema).min(1).max(200) }) },
  async ({ body, supabase, user, params }) => {
    const { id } = idParams.parse(params);
    const { data: c } = await supabase.from("collections").select("id").eq("id", id).eq("owner_id", user.id).maybeSingle();
    must(c);
    let added = 0;
    for (const it of body.items) {
      const { error } = await supabase.from("collection_items").insert({ collection_id: id, owner_id: user.id, [COLUMN[it.type]]: it.id });
      if (!error) added++;
      else if (error.code === "23503") throw errors.badRequest("One of those items doesn't exist.");
      else if (error.code !== "23505") throw error; // already in the collection: fine
    }
    await supabase.from("collections").update({ updated_at: new Date().toISOString() }).eq("id", id).eq("owner_id", user.id);
    return { added };
  },
);

const delQuery = itemSchema;
export const DELETE = route<undefined, z.infer<typeof delQuery>, P>({ query: delQuery }, async ({ query, supabase, user, params }) => {
  const { id } = idParams.parse(params);
  const { error } = await supabase.from("collection_items").delete().eq("collection_id", id).eq("owner_id", user.id).eq(COLUMN[query.type], query.id);
  if (error) throw error;
  return { ok: true };
});
