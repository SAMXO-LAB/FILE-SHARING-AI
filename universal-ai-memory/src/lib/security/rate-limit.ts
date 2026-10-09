import "server-only";
import { adminConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

// Fallback for development without a service key. Per-process only, so not suitable for
// multi-instance production; the Postgres-backed limiter below is used whenever configured.
const memory = new Map<string, { count: number; resetAt: number }>();

export function memoryRateLimit(key: string, windowSeconds: number, max: number, now = Date.now()): RateLimitResult {
  const bucket = memory.get(key);
  if (!bucket || bucket.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    if (memory.size > 5000) for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
    return { allowed: true, remaining: max - 1, retryAfterSeconds: 0 };
  }
  bucket.count += 1;
  const allowed = bucket.count <= max;
  return {
    allowed,
    remaining: Math.max(max - bucket.count, 0),
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

export function _resetMemoryRateLimit() {
  memory.clear();
}

/** Fixed-window limiter shared across instances through Postgres (rate_limit_hit()). */
export async function rateLimit(key: string, windowSeconds: number, max: number): Promise<RateLimitResult> {
  if (!adminConfigured()) return memoryRateLimit(key, windowSeconds, max);
  const { data, error } = await createAdminClient().rpc("rate_limit_hit", {
    p_key: key,
    p_window_seconds: windowSeconds,
    p_max: max,
  });
  if (error || !data?.[0]) {
    // Fail open on infrastructure errors but still apply the in-process limit.
    return memoryRateLimit(key, windowSeconds, max);
  }
  const row = data[0] as { allowed: boolean; remaining: number; retry_after_seconds: number };
  return { allowed: row.allowed, remaining: row.remaining, retryAfterSeconds: row.retry_after_seconds };
}
