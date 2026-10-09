import { z } from "zod";
import { errors, must, route } from "@/lib/api";
import { adminOrThrow } from "@/lib/server/context";
import { cleanTags } from "@/lib/server/files";
import { idParams } from "@/lib/validation";

const patch = z.object({ starred: z.boolean(), tags: z.array(z.string().max(60)).max(20) }).partial().strict();

export const PATCH = route<z.infer<typeof patch>, undefined, { id: string }>({ body: patch }, async ({ body, supabase, user, params }) => {
  const { id } = idParams.parse(params);
  const { data: link } = await supabase.from("links").select("id").eq("id", id).eq("owner_id", user.id).maybeSingle();
  must(link);
  const update: Record<string, unknown> = {};
  if (body.starred !== undefined) update.starred = body.starred;
  if (body.tags !== undefined) update.tags = cleanTags(body.tags);
  if (Object.keys(update).length === 0) throw errors.badRequest("Nothing to update.");
  // Browser clients may only toggle `starred`; tags are written by the server after the ownership check above.
  const { data, error } = await adminOrThrow().from("links").update(update).eq("id", id).eq("owner_id", user.id).select("*").single();
  if (error) throw error;
  return { link: data };
});

export const DELETE = route<undefined, undefined, { id: string }>({}, async ({ supabase, user, params }) => {
  const { id } = idParams.parse(params);
  const { error } = await supabase.from("links").delete().eq("id", id).eq("owner_id", user.id);
  if (error) throw error;
  return { ok: true };
});
