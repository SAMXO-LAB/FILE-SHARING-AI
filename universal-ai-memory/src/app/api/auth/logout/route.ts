import { route } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

export const POST = route({ auth: false }, async () => {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return { ok: true };
});
