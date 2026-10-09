import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv, supabaseSecretKey } from "@/lib/env";

let admin: SupabaseClient | null = null;

/**
 * Service-role client. BYPASSES row level security.
 * Use only for: queue/worker operations, storage verification and signed URLs after an explicit
 * authorization check, audit writes, rate limiting, webhooks, and account deletion.
 * Always pass the owner id explicitly and never trust client-supplied ids without checking ownership.
 */
export function createAdminClient(): SupabaseClient {
  const key = supabaseSecretKey();
  if (!publicEnv.supabaseUrl || !key) {
    throw new Error("Server is missing SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).");
  }
  admin ??= createSupabaseClient(publicEnv.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}
