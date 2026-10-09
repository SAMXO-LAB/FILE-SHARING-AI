"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/security/redirect";

/**
 * "Continue with Google" via Supabase Auth (OAuth + PKCE). Google returns to Supabase, Supabase
 * returns to /auth/callback on this site, and the server exchanges the one-time code for a session.
 * The same button signs in existing users and creates an account for new ones.
 */
export function GoogleButton({ next, label = "Continue with Google" }: { next?: string | null; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setError(null);
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext(next))}`;
    const { error: err } = await createClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (err) {
      setError("Google sign-in isn't available right now. Try again, or use email and password.");
      setBusy(false);
    }
    // On success the browser is already navigating to Google.
  }
  return (
    <div className="space-y-2">
      <Button type="button" variant="glass" className="w-full" loading={busy} onClick={() => void go()}>
        <span aria-hidden className="grid h-5 w-5 place-items-center rounded-full border border-current text-[12px] font-bold leading-none">G</span>
        {label}
      </Button>
      <FieldError>{error}</FieldError>
    </div>
  );
}

export function OrDivider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-muted" role="separator" aria-label="or">
      <span className="h-px flex-1 bg-[rgb(var(--line)/0.18)]" />or<span className="h-px flex-1 bg-[rgb(var(--line)/0.18)]" />
    </div>
  );
}
