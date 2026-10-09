import { z } from "zod";
import { errors, must, route } from "@/lib/api";
import { indexNoteLater } from "@/lib/server/context";
import { idParams } from "@/lib/validation";

type P = { id: string };

export const GET = route<undefined, undefined, P>({}, async ({ supabase, user, params }) => {
  const { id } = idParams.parse(params);
  const { data } = await supabase.from("notes").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle();
  return { note: must(data) };
});

const patch = z
  .object({ title: z.string().trim().min(1).max(200), body: z.string().max(200_000), starred: z.boolean() })
  .partial()
  .strict();

export const PATCH = route<z.infer<typeof patch>, undefined, P>({ body: patch }, async ({ body, supabase, user, params }) => {
  const { id } = idParams.parse(params);
  if (Object.keys(body).length === 0) throw errors.badRequest("Nothing to update.");
  const { data, error } = await supabase.from("notes").update(body).eq("id", id).eq("owner_id", user.id).select("*").maybeSingle();
  if (error) throw error;
  if (body.title !== undefined || body.body !== undefined) indexNoteLater(id);
  return { note: must(data) };
});

export const DELETE = route<undefined, undefined, P>({}, async ({ supabase, user, params }) => {
  const { id } = idParams.parse(params);
  const { error } = await supabase.from("notes").delete().eq("id", id).eq("owner_id", user.id);
  if (error) throw error; // memory_records rows go with it (ON DELETE CASCADE)
  return { ok: true };
});
