import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

let client: ReturnType<typeof createBrowserClient> | null = null;

/** Browser client. Uses only the publishable key; all access is governed by RLS. */
export function createClient() {
  client ??= createBrowserClient(publicEnv.supabaseUrl!, publicEnv.supabaseKey!);
  return client;
}
