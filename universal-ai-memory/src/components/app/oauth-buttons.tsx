"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { FieldError } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/security/redirect";

/** Google's multicolour "G", as required on Sign in with Google buttons. */
function GoogleG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

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
      <motion.button
        type="button"
        onClick={() => void go()}
        disabled={busy}
        aria-busy={busy || undefined}
        initial="rest"
        animate={busy ? "busy" : "rest"}
        whileHover={busy ? undefined : "hover"}
        whileTap={busy ? undefined : "tap"}
        variants={{ rest: { y: 0, scale: 1 }, hover: { y: -2 }, tap: { scale: 0.97 }, busy: { scale: 0.99 } }}
        transition={{ type: "spring", stiffness: 500, damping: 28 }}
        className="google-btn group relative flex h-11 w-full items-center justify-center gap-3 overflow-hidden rounded-[calc(var(--radius)*0.7)] border hairline bg-card text-[15px] font-medium text-fg shadow-[var(--shadow-xs)] transition-[box-shadow,border-color] duration-200 hover:border-[rgb(var(--line)/0.2)] hover:shadow-[var(--shadow-md)] disabled:cursor-wait"
      >
        <span aria-hidden className="google-btn-glow pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <span className="relative grid h-6 w-6 place-items-center">
          {busy && <span aria-hidden className="google-btn-ring absolute -inset-1 rounded-full" />}
          <motion.span
            className="grid place-items-center"
            variants={{ rest: { rotate: 0, scale: 1 }, hover: { rotate: [0, -14, 10, 0], scale: 1.12 }, tap: { scale: 0.9 }, busy: { scale: 0.8 } }}
            transition={{ duration: 0.5 }}
          >
            <GoogleG className="h-5 w-5" />
          </motion.span>
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={busy ? "busy" : "idle"} className="relative" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            {busy ? "Opening Google…" : label}
          </motion.span>
        </AnimatePresence>
      </motion.button>
      <FieldError>{error}</FieldError>
    </div>
  );
}

export function OrDivider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-muted" role="separator" aria-label="or">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[rgb(var(--line)/0.18)]" />or<span className="h-px flex-1 bg-gradient-to-l from-transparent to-[rgb(var(--line)/0.18)]" />
    </div>
  );
}
