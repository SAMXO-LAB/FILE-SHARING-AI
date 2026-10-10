"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AuthShell, AuthSubmit } from "@/components/app/auth-shell";
import { GoogleButton, OrDivider } from "@/components/app/oauth-buttons";
import { FieldError, Input, Label } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/client/api";
import { safeNext } from "@/lib/security/redirect";

const schema = z.object({ identifier: z.string().trim().min(1, "Enter your email or username").max(254), password: z.string().min(1, "Enter your password") });
type Values = z.infer<typeof schema>;

const URL_ERRORS: Record<string, string> = {
  link_invalid: "That link is invalid or has expired. Request a new one.",
  oauth_cancelled: "Google sign-in was cancelled.",
  oauth_failed: "Google sign-in didn't complete. Please try again.",
};

export function LoginForm({ google = false }: { google?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [formError, setFormError] = useState<string | null>(URL_ERRORS[params.get("error") ?? ""] ?? null);
  const [done, setDone] = useState(false);
  const [errorKey, setErrorKey] = useState(0);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema) });

  async function onSubmit(values: Values) {
    setFormError(null);
    try {
      await api("/api/auth/login", { body: values });
      setDone(true);
      router.replace(safeNext(params.get("next")));
      router.refresh();
    } catch (e) {
      setFormError(errorMessage(e));
      setErrorKey((k) => k + 1);
    }
  }

  return (
    <AuthShell errorKey={errorKey} title="Welcome back" subtitle="Sign in to search and ask questions about your memory." footer={<>New here? <Link href="/signup" className="text-accent underline-offset-4 hover:underline">Create an account</Link></>}>
      {google && <><GoogleButton next={params.get("next")} /><OrDivider /></>}
      <form onSubmit={handleSubmit(onSubmit, () => setErrorKey((k) => k + 1))} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="identifier">Email or username</Label>
          <Input id="identifier" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="you@gmail.com or your_username" aria-invalid={!!errors.identifier} {...register("identifier")} />
          <FieldError>{errors.identifier?.message}</FieldError>
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
        <AuthSubmit busy={isSubmitting} done={done} busyLabel="Signing you in…" doneLabel="Welcome back!">Sign in</AuthSubmit>
      </form>
    </AuthShell>
  );
}
