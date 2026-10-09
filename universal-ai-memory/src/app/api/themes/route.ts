import { route } from "@/lib/api";
import { customThemeSchema } from "@/lib/themes";

export const GET = route({}, async ({ supabase, user }) => {
  const { data, error } = await supabase.from("user_themes").select("*").eq("user_id", user.id).limit(1);
  if (error) throw error;
  return { theme: data?.[0] ?? null };
});

/** Saves the user's custom theme. Tokens are validated colours/numbers only; no CSS or JS is accepted. */
export const PUT = route({ body: customThemeSchema }, async ({ body, supabase, user }) => {
  const { data, error } = await supabase
    .from("user_themes")
    .upsert({ user_id: user.id, name: body.name, tokens: body.tokens }, { onConflict: "user_id,name" })
    .select("*")
    .single();
  if (error) throw error;
  return { theme: data };
});
