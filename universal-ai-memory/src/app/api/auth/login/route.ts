import { z } from "zod";
import { ApiError, route } from "@/lib/api";
import { adminConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const INVALID = () => new ApiError(401, "invalid_credentials", "Incorrect email, username or password.");

/** Resolves a username to the account's sign-in email (server-side only; never returned to the client). */
async function emailForUsername(username: string): Promise<string | null> {
  if (!adminConfigured()) return null;
  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("id").ilike("username", username.replace(/[\\%_]/g, (m) => `\\${m}`)).maybeSingle();
  if (!prof) return null;
  const { data } = await admin.auth.admin.getUserById(prof.id as string);
  return data.user?.email ?? null;
}

const body = z.object({
  // `email` is kept for older clients; it may hold an email address or a username.
  identifier: z.string().trim().min(1).max(254).optional(),
  email: z.string().trim().min(1).max(254).optional(),
  password: z.string().min(1).max(200),
}).refine((b) => Boolean(b.identifier || b.email), "Enter your email or username.");

export const POST = route(
  { auth: false, body, rateLimit: { name: "login", max: 10, windowSeconds: 600 } },
  async ({ body }) => {
    const id = (body.identifier ?? body.email ?? "").replace(/^@/, "");
    let email: string | null = id;
    if (!id.includes("@")) {
      if (!/^[a-zA-Z0-9_]{3,30}$/.test(id)) throw INVALID();
      email = await emailForUsername(id);
      if (!email) throw INVALID(); // same message as a wrong password: don't reveal which usernames exist
    } else if (!z.email().safeParse(id).success) {
      throw new ApiError(400, "bad_request", "Enter a valid email address or username.");
    }
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password: body.password });
    if (error) {
      if (/confirm/i.test(error.message)) throw new ApiError(403, "email_not_confirmed", "Please confirm your email address first. Check your inbox for the verification link.");
      throw INVALID();
    }
    return { ok: true };
  },
);
