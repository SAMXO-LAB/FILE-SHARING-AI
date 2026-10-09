"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, MailCheck, XCircle } from "lucide-react";
import { z } from "zod";
import { AuthShell } from "@/components/app/auth-shell";
import { Button } from "@/components/ui/button";
import { FieldError, Hint, Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { api, ApiClientError, errorMessage } from "@/lib/client/api";
import { emailSchema, passwordSchema, usernameSchema } from "@/lib/validation";

const schema = z.object({ displayName: z.string().trim().max(80).optional(), username: usernameSchema, email: emailSchema, password: passwordSchema });
type Values = z.infer<typeof schema>;
type Check = { state: "idle" | "checking" | "ok" | "bad"; message?: string };

export function SignupForm() {
  const [done, setDone] = useState<{ email: string; needsConfirmation: boolean } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [check, setCheck] = useState<Check>({ state: "idle" });
  const { register, handleSubmit, watch, setError, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema), mode: "onTouched" });
  const username = watch("username");

  useEffect(() => {
    if (!username || !/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      setCheck({ state: "idle" });
      return;
    }
    setCheck({ state: "checking" });
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await api<{ available: boolean; message: string }>("/api/auth/username-check", { body: { username }, signal: ctrl.signal });
        setCheck({ state: r.available ? "ok" : "bad", message: r.message });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setCheck({ state: "idle" });
      }
    }, 400);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [username]);

  async function onSubmit(values: Values) {
    setFormError(null);
    try {
      const r = await api<{ needsConfirmation: boolean }>("/api/auth/signup", { body: values });
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload so the new session cookie is picked up
      if (!r.needsConfirmation) { window.location.assign("/"); return; }
      setDone({ email: values.email, needsConfirmation: true });
    } catch (e) {
      if (e instanceof ApiClientError && (e.details as { field?: string } | undefined)?.field === "username") setError("username", { message: e.message });
      else setFormError(errorMessage(e));
    }
  }

  if (done) {
    return (
      <AuthShell title="Check your email">
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-accent/15 text-accent"><MailCheck className="h-6 w-6" /></div>
          <p className="text-sm text-muted">We sent a verification link to <span className="text-fg">{done.email}</span>. Open it to finish creating your account, then sign in.</p>
          <Button asChild variant="glass" className="mt-2"><Link href="/login">Go to sign in</Link></Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create your account" subtitle="One private place to search everything you save." footer={<>Already have an account? <Link href="/login" className="text-accent underline-offset-4 hover:underline">Sign in</Link></>}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="displayName">Name <span className="font-normal text-muted">(optional)</span></Label>
          <Input id="displayName" autoComplete="name" {...register("displayName")} />
        </div>
        <div>
          <Label htmlFor="username">Username</Label>
          <div className="relative">
            <Input id="username" autoComplete="username" autoCapitalize="none" spellCheck={false} aria-invalid={!!errors.username || check.state === "bad"} aria-describedby="username-hint" className="pr-10" {...register("username")} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              {check.state === "checking" && <Spinner className="h-4 w-4" />}
              {check.state === "ok" && <CheckCircle2 className="h-4 w-4 text-ok" aria-label="Available" />}
              {check.state === "bad" && <XCircle className="h-4 w-4 text-danger" aria-label="Unavailable" />}
            </span>
          </div>
          {errors.username ? <FieldError>{errors.username.message}</FieldError> : check.state === "bad" ? <FieldError>{check.message}</FieldError> : <p id="username-hint" className="mt-1.5 text-xs text-muted">{check.state === "ok" ? "Available" : "3–30 letters, numbers or underscores."}</p>}
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register("email")} />
          <FieldError>{errors.email?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register("password")} />
          {errors.password ? <FieldError>{errors.password.message}</FieldError> : <Hint>At least 10 characters, with a letter and a number.</Hint>}
        </div>
        <FieldError>{formError}</FieldError>
        <Button type="submit" className="w-full" loading={isSubmitting} disabled={check.state === "bad"}>Create account</Button>
      </form>
    </AuthShell>
  );
}
