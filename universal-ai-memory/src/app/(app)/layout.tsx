import { redirect } from "next/navigation";
import { AppProvider } from "@/components/app/app-context";
import { AppShell } from "@/components/app/app-shell";
import { capabilities, supabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { Preferences, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!supabaseConfigured()) redirect("/setup");
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const [{ data: profile }, { data: prefs }, { data: theme }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", auth.user.id).maybeSingle(),
    supabase.from("user_preferences").select("*").eq("user_id", auth.user.id).maybeSingle(),
    supabase.from("user_themes").select("tokens").eq("user_id", auth.user.id).limit(1).maybeSingle(),
  ]);
  if (!profile || !prefs) {
    // The signup trigger creates both rows; if they're missing the account setup didn't finish.
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="glass max-w-md p-8">
          <h1 className="text-lg font-semibold">Your account isn't ready yet</h1>
          <p className="mt-2 text-sm text-muted">We couldn't find your profile. If you just signed up, wait a moment and refresh. If this keeps happening, check that the database migrations were applied.</p>
        </div>
      </main>
    );
  }
  return (
    <AppProvider profile={profile as Profile} email={auth.user.email ?? null} prefs={prefs as Preferences} caps={capabilities()} customTokens={(theme as { tokens?: unknown } | null)?.tokens ?? null}>
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
}
