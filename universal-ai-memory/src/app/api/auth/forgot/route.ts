import { z } from "zod";
import { route } from "@/lib/api";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { emailSchema } from "@/lib/validation";

export const POST = route(
  { auth: false, body: z.object({ email: emailSchema }), rateLimit: { name: "forgot", max: 5, windowSeconds: 3600 } },
  async ({ body }) => {
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(body.email, { redirectTo: `${publicEnv.appUrl}/auth/callback?next=/reset-password` });
    // Always the same answer: never reveal whether an address has an account.
    return { ok: true };
  },
);
