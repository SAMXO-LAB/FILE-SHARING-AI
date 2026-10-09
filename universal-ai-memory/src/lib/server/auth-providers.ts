import "server-only";
import { publicEnv } from "@/lib/env";

/**
 * Which external sign-in providers are switched on in Supabase Auth. Read from Supabase's public
 * settings endpoint (cached for a minute) so a "Continue with Google" button only appears once
 * Google has actually been enabled in the Supabase dashboard.
 */
export async function enabledProviders(): Promise<{ google: boolean }> {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseKey) return { google: false };
  try {
    const res = await fetch(`${publicEnv.supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: publicEnv.supabaseKey },
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { google: false };
    const s = (await res.json()) as { external?: Record<string, boolean> };
    return { google: Boolean(s.external?.google) };
  } catch {
    return { google: false };
  }
}
