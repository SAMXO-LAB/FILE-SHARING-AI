"use client";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AuthShell } from "@/components/app/auth-shell";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/client/api";

const schema = z.object({ email: z.string().trim().email("Enter a valid email address") });

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a link to choose a new one." footer={<Link href="/login" className="text-accent underline-offset-4 hover:underline">Back to sign in</Link>}>
      {sent ? (
        <p className="text-sm text-muted" role="status">If an account exists for that address, a reset link is on its way. It can take a minute to arrive.</p>
      ) : (
        <form noValidate className="space-y-4" onSubmit={handleSubmit(async (v) => { setError(null); try { await api("/api/auth/forgot", { body: v }); setSent(true); } catch (e) { setError(errorMessage(e)); } })}>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register("email")} />
            <FieldError>{errors.email?.message}</FieldError>
          </div>
          <FieldError>{error}</FieldError>
          <Button type="submit" className="w-full" loading={isSubmitting}>Send reset link</Button>
        </form>
      )}
    </AuthShell>
  );
}
