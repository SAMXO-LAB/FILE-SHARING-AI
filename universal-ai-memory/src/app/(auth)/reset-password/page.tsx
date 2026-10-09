"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { AuthShell } from "@/components/app/auth-shell";
import { Button } from "@/components/ui/button";
import { FieldError, Hint, Input, Label } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/client/api";
import { passwordSchema } from "@/lib/validation";

const schema = z.object({ password: passwordSchema, confirm: z.string() }).refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

export default function ResetPasswordPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  return (
    <AuthShell title="Choose a new password" subtitle="Use the link from your email to get here. Then set a new password below.">
      <form noValidate className="space-y-4" onSubmit={handleSubmit(async (v) => {
        setError(null);
        try {
          await api("/api/auth/reset", { body: { password: v.password } });
          toast.success("Password updated");
          router.replace("/");
          router.refresh();
        } catch (e) { setError(errorMessage(e)); }
      })}>
        <div>
          <Label htmlFor="password">New password</Label>
          <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register("password")} />
          {errors.password ? <FieldError>{errors.password.message}</FieldError> : <Hint>At least 10 characters, with a letter and a number.</Hint>}
        </div>
        <div>
          <Label htmlFor="confirm">Confirm password</Label>
          <Input id="confirm" type="password" autoComplete="new-password" aria-invalid={!!errors.confirm} {...register("confirm")} />
          <FieldError>{errors.confirm?.message}</FieldError>
        </div>
        <FieldError>{error}</FieldError>
        <Button type="submit" className="w-full" loading={isSubmitting}>Update password</Button>
      </form>
    </AuthShell>
  );
}
