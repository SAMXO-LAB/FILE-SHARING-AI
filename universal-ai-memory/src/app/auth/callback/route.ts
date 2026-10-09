import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/security/redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for email links (confirmation, password reset) and for Google sign-in.
 * Exchanges the one-time code for a session cookie, then continues on this same site.
 * Redirects stay on the request's own origin, so preview deployments keep their session, and
 * `next` is restricted to same-site paths (no open redirects).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  const providerError = url.searchParams.get("error");
  if (providerError) {
    const kind = providerError === "access_denied" ? "oauth_cancelled" : "oauth_failed";
    return NextResponse.redirect(new URL(`/login?error=${kind}`, origin));
  }
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }
  return NextResponse.redirect(new URL("/login?error=link_invalid", origin));
}
