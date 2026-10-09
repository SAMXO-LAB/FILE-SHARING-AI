import { z } from "zod";
import { ApiError, route } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { emailSchema } from "@/lib/validation";

export const POST = route(
  { auth: false, body: z.object({ email: emailSchema, password: z.string().min(1).max(200) }), rateLimit: { name: "login", max: 10, windowSeconds: 600 } },
  async ({ body }) => {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: body.email, password: body.password });
    if (error) {
      if (/confirm/i.test(error.message)) throw new ApiError(403, "email_not_confirmed", "Please confirm your email address first. Check your inbox for the verification link.");
      throw new ApiError(401, "invalid_credentials", "Incorrect email or password.");
    }
    return { ok: true };
  },
);
