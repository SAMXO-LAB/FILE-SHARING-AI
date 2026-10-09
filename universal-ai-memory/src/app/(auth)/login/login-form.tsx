"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AuthShell } from "@/components/app/auth-shell";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/client/api";
import { safeNext } from "@/lib/security/redirect";

const schema = z.object({ email: z.string().trim().email("Enter a valid email address"), password: z.string().min(1, "Enter your password") });
type Values = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [formError, setFormError] = useState<string | null>(params.get("error") === "link_invalid" ? "That link is invalid or has expired. Request a new one." : null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema) });

  async function onSubmit(values: Values) {
    setFormError(null);
    try {
      await api("/api/auth/login", { body: values });
      router.replace(safeNext(params.get("next")));
      router.refresh();
    } catch (e) {
      setFormError(errorMessage(e));
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to search and ask questions about your memory." footer={<>New here? <Link href="/signup" className="text-accent underline-offset-4 hover:underline">Create an account</Link></>}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register("email")} />
          <FieldError>{errors.email?.message}</FieldError>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="mb-1.5 text-xs text-muted hover:text-fg">Forgot password?</Link>
          </div>
          <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!errors.password} {...register("password")} />
          <FieldError>{errors.password?.message}</FieldError>
        </div>
        <FieldError>{formError}</FieldError>
        <Button type="submit" className="w-full" loading={isSubmitting}>Sign in</Button>
      </form>
    </AuthShell>
  );
}
