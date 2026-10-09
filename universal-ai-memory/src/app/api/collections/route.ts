import { z } from "zod";
import { errors, route } from "@/lib/api";

export const GET = route({}, async ({ supabase, user }) => {
  const { data, error } = await supabase
    .from("collections").select("id,name,description,color,created_at,updated_at,collection_items(count)")
    .eq("owner_id", user.id).order("updated_at", { ascending: false });
  if (error) throw error;
  return {
    collections: (data ?? []).map((c: any) => ({ ...c, itemCount: c.collection_items?.[0]?.count ?? 0, collection_items: undefined })),
  };
});

const collectionBody = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
});

export const POST = route({ body: collectionBody, rateLimit: { name: "collection-create", max: 60, windowSeconds: 600 } }, async ({ body, supabase, user }) => {
  const { data, error } = await supabase
    .from("collections").insert({ owner_id: user.id, name: body.name, description: body.description || null, color: body.color ?? null }).select("*").single();
  if (error) {
    if (error.code === "23505") throw errors.conflict("You already have a collection with that name.");
    throw error;
  }
  return { collection: data };
});
