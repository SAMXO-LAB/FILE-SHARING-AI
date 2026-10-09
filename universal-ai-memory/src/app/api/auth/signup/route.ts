import { z } from "zod";
import { errors, route, usernameMessage } from "@/lib/api";
import { publicEnv } from "@/lib/env";
import { adminOrThrow } from "@/lib/server/context";
import { createClient } from "@/lib/supabase/server";
import { emailSchema, passwordSchema, usernameSchema } from "@/lib/validation";

export const POST = route(
  {
    auth: false,
    body: z.object({ email: emailSchema, password: passwordSchema, username: usernameSchema, displayName: z.string().trim().max(80).optional() }),
    rateLimit: { name: "signup", max: 8, windowSeconds: 3600 },
  },
  async ({ body }) => {
    const { data: check, error: checkErr } = await adminOrThrow().rpc("username_check", { p: body.username });
    if (checkErr) throw checkErr;
    if (check !== "ok") throw errors.badRequest(usernameMessage(check as string), { field: "username", code: check });

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email: body.email,
      password: body.password,
      options: {
        data: { username: body.username, display_name: body.displayName ?? null },
        emailRedirectTo: `${publicEnv.appUrl}/auth/callback?next=/`,
      },
    });
    if (error) {
      // Same response whether or not the address exists, to avoid account enumeration.
      if (/registered|exists/i.test(error.message)) return { ok: true, needsConfirmation: true };
      throw errors.badRequest(error.message);
    }
    return { ok: true, needsConfirmation: !data.session };
  },
);
