import { z } from "zod";
import { errors, route } from "@/lib/api";
import { audit } from "@/lib/server/context";
import { passwordSchema } from "@/lib/validation";

/** Sets a new password for the signed-in (or password-recovery) session. */
export const POST = route({ body: z.object({ password: passwordSchema }), rateLimit: { name: "reset", max: 10, windowSeconds: 3600 } }, async ({ body, supabase, user }) => {
  const { error } = await supabase.auth.updateUser({ password: body.password });
  if (error) throw errors.badRequest(error.message);
  await audit(user.id, "auth.password_changed");
  return { ok: true };
});
