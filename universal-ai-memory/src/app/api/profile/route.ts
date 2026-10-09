import { z } from "zod";
import { errors, route } from "@/lib/api";

export const GET = route({}, async ({ supabase, user }) => {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (error) throw error;
  return { profile: data, email: user.email };
});

export const PATCH = route(
  {
    body: z.object({
      display_name: z.string().trim().max(80).nullable().optional(),
      bio: z.string().trim().max(500).nullable().optional(),
      profile_visibility: z.enum(["private", "connections", "public"]).optional(),
    }),
  },
  async ({ body, supabase, user }) => {
    if (Object.keys(body).length === 0) throw errors.badRequest("Nothing to update.");
    const { data, error } = await supabase.from("profiles").update(body).eq("id", user.id).select("*").single();
    if (error) throw error;
    return { profile: data };
  },
);
