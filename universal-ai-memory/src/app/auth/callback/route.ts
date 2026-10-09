import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import { safeNext } from "@/lib/security/redirect";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, publicEnv.appUrl));
  }
  return NextResponse.redirect(new URL("/login?error=link_invalid", publicEnv.appUrl));
}
