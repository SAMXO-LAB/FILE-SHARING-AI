import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/security/redirect";

const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/setup", "/auth/callback"];
const isPublic = (p: string) => PUBLIC_PATHS.some((x) => p === x || p.startsWith(`${x}/`));

function buildCsp(nonce: string): string {
  const dev = process.env.NODE_ENV !== "production";
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseWs = supabase.replace(/^http/, "ws");
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // Signed URLs for previews come from the Supabase storage origin; blob:/data: for local previews.
    `img-src 'self' blob: data: ${supabase}`,
    `media-src 'self' blob: ${supabase}`,
    `font-src 'self' data:`,
    `connect-src 'self' ${supabase} ${supabaseWs}`,
    // PDF preview: an iframe to the signed storage URL (sandboxed in the component).
    `frame-src ${supabase}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const { pathname } = request.nextUrl;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Not configured yet: show the setup page instead of failing.
    if (pathname !== "/setup" && !pathname.startsWith("/api/")) {
      const redirect = NextResponse.redirect(new URL("/setup", request.url));
      redirect.headers.set("content-security-policy", csp);
      return redirect;
    }
    response.headers.set("content-security-policy", csp);
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: requestHeaders } });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Refreshes the session cookie when needed. This is an optimistic check for redirects only;
  // every route and page re-validates with auth.getUser() and the database enforces RLS.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  if (!pathname.startsWith("/api/") && pathname !== "/auth/callback") {
    if (!signedIn && !isPublic(pathname)) {
      const to = new URL("/login", request.url);
      if (pathname !== "/") to.searchParams.set("next", safeNext(pathname + request.nextUrl.search));
      const redirect = NextResponse.redirect(to);
      redirect.headers.set("content-security-policy", csp);
      return redirect;
    }
    if (signedIn && (pathname === "/login" || pathname === "/signup")) {
      const redirect = NextResponse.redirect(new URL("/", request.url));
      redirect.headers.set("content-security-policy", csp);
      return redirect;
    }
  }

  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
