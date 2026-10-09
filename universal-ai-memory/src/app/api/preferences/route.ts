import { z } from "zod";
import { errors, route } from "@/lib/api";
import { audit } from "@/lib/server/context";
import { prefsPatch } from "@/lib/validation";

export const GET = route({}, async ({ supabase, user }) => {
  const { data, error } = await supabase.from("user_preferences").select("*").eq("user_id", user.id).single();
  if (error) throw error;
  return { preferences: data };
});

export const PATCH = route({ body: prefsPatch }, async ({ body, supabase, user }) => {
  const { privacy_acknowledged, ...rest } = body;
  const patch: Record<string, unknown> = { ...rest };
  if (privacy_acknowledged) patch.privacy_acknowledged_at = new Date().toISOString();
  if (Object.keys(patch).length === 0) throw errors.badRequest("Nothing to update.");
  const { data, error } = await supabase.from("user_preferences").update(patch).eq("user_id", user.id).select("*").single();
  if (error) throw error;
  if (body.processing_mode) await audit(user.id, "privacy.processing_mode_changed", { type: "preferences", id: user.id }, { mode: body.processing_mode });
  return { preferences: data };
});
