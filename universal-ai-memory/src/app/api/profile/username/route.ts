import { z } from "zod";
import { route } from "@/lib/api";
import { audit } from "@/lib/server/context";
import { usernameSchema } from "@/lib/validation";

export const POST = route(
  { body: z.object({ username: usernameSchema }), rateLimit: { name: "username-change", max: 5, windowSeconds: 3600 } },
  async ({ body, supabase, user }) => {
    const { error } = await supabase.rpc("change_username", { p_new: body.username });
    if (error) throw error;
    await audit(user.id, "profile.username_changed", { type: "profile", id: user.id }, { to: body.username });
    return { ok: true, username: body.username };
  },
);
