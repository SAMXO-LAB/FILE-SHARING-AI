import { z } from "zod";
import { ApiError, errors, route } from "@/lib/api";
import { audit } from "@/lib/server/context";
import { passwordSchema } from "@/lib/validation";

const body = z.object({ currentPassword: z.string().min(1).max(200), newPassword: passwordSchema });

export const POST = route({ body, rateLimit: { name: "password-change", max: 5, windowSeconds: 600 } }, async ({ body, supabase, user }) => {
  if (!user.email) throw errors.badRequest("This account has no email/password sign-in.");
  if (body.currentPassword === body.newPassword) throw errors.badRequest("Choose a password different from the current one.");
  const { error: verifyErr } = await supabase.auth.signInWithPassword({ email: user.email, password: body.currentPassword });
  if (verifyErr) throw new ApiError(401, "invalid_credentials", "Your current password is incorrect.");
  const { error } = await supabase.auth.updateUser({ password: body.newPassword });
  if (error) throw errors.badRequest(error.message.includes("weak") ? "That password is too weak." : "Couldn't change the password. Try a different one.");
  await audit(user.id, "account.password_changed", { type: "profile", id: user.id });
  return { ok: true };
});
