import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z, type ZodType } from "zod";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { supabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { isSameOrigin } from "@/lib/security/origin";
import { rateLimit } from "@/lib/security/rate-limit";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const errors = {
  unauthorized: () => new ApiError(401, "unauthorized", "Please sign in again."),
  forbidden: (m = "You do not have permission to do that.") => new ApiError(403, "forbidden", m),
  notFound: (m = "That item was not found.") => new ApiError(404, "not_found", m),
  badRequest: (m: string, details?: unknown) => new ApiError(400, "bad_request", m, details),
  conflict: (m: string) => new ApiError(409, "conflict", m),
  notConfigured: (m: string) => new ApiError(503, "not_configured", m),
};

export interface RateLimitSpec {
  /** Bucket name; combined with the user id (or client ip for anonymous routes). */
  name: string;
  max: number;
  windowSeconds: number;
}

interface Ctx<B, Q, P> {
  req: NextRequest;
  user: User;
  supabase: SupabaseClient;
  body: B;
  query: Q;
  params: P;
}

interface Options<B, Q, P> {
  /** Defaults to true. Public routes (e.g. username check) set false and receive a placeholder user. */
  auth?: boolean;
  body?: ZodType<B>;
  query?: ZodType<Q>;
  rateLimit?: RateLimitSpec;
  /** Disable the same-origin check (webhooks / cron that authenticate with their own secret). */
  csrf?: boolean;
  _params?: P;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim();
}

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, headers: { "Cache-Control": "private, no-store", ...(init?.headers ?? {}) } });
}

export function errorResponse(err: unknown, requestId: string): NextResponse {
  if (err instanceof ApiError) {
    return json({ error: { code: err.code, message: err.message, details: err.details } }, { status: err.status });
  }
  if (err instanceof z.ZodError) {
    const fields = err.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`);
    return json(
      { error: { code: "invalid_input", message: `Invalid input. ${fields.slice(0, 3).join("; ")}`, details: fields } },
      { status: 400 },
    );
  }
  const pg = err as { code?: string; message?: string; details?: string };
  // Known Postgres signals raised by our own functions/constraints.
  if (pg?.message?.includes("quota_exceeded")) {
    return json({ error: { code: "quota_exceeded", message: "Not enough storage left. Delete some files or empty the trash." } }, { status: 413 });
  }
  if (pg?.message?.includes("file_too_large")) {
    return json({ error: { code: "file_too_large", message: "That file is larger than your per-file upload limit." } }, { status: 413 });
  }
  if (pg?.message?.match(/username_(invalid_format|reserved|taken|change_cooldown)/)) {
    const code = pg.message.match(/username_(invalid_format|reserved|taken|change_cooldown)/)![1]!;
    return json({ error: { code: `username_${code}`, message: usernameMessage(code) } }, { status: 400 });
  }
  if (pg?.code === "42501") {
    return json({ error: { code: "forbidden", message: "You do not have permission to do that." } }, { status: 403 });
  }
  if (pg?.code === "23505") {
    return json({ error: { code: "conflict", message: "That already exists." } }, { status: 409 });
  }
  // Never echo internals to the client. Log a short, non-content message for operators.
  console.error(`[api ${requestId}]`, pg?.code ?? "", (pg?.message ?? String(err)).slice(0, 300));
  return json({ error: { code: "internal", message: "Unexpected server error. Please try again.", requestId } }, { status: 500 });
}

export function usernameMessage(code: string): string {
  switch (code) {
    case "invalid_format": return "Usernames use 3–30 letters, numbers or single underscores, and can't start or end with an underscore.";
    case "reserved": return "That username is reserved. Please choose another.";
    case "taken": return "That username is taken (or too similar to an existing one).";
    case "change_cooldown": return "You can change your username once every 14 days.";
    default: return "That username isn't available.";
  }
}

type RouteContext<P> = { params: Promise<P> };

/**
 * Wraps a route handler with: configuration check, CSRF check, authentication, rate limiting,
 * input validation and uniform error handling. Handlers return a Response or a JSON-able value.
 */
export function route<B = undefined, Q = undefined, P = Record<string, string>>(
  opts: Options<B, Q, P>,
  handler: (ctx: Ctx<B, Q, P>) => Promise<Response | unknown>,
) {
  const requireAuth = opts.auth !== false;
  return async (req: NextRequest, routeCtx?: RouteContext<P>): Promise<Response> => {
    const requestId = crypto.randomUUID().slice(0, 8);
    try {
      if (!supabaseConfigured()) {
        throw errors.notConfigured("Supabase is not configured. Copy .env.example to .env.local and set the Supabase variables.");
      }
      if (opts.csrf !== false && !SAFE_METHODS.has(req.method) && !isSameOrigin(req.headers, req.url)) {
        throw new ApiError(403, "bad_origin", "Cross-site request blocked.");
      }

      let user: User = { id: "anonymous" } as User;
      let supabase = null as unknown as SupabaseClient;
      if (requireAuth) {
        supabase = await createClient();
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) throw errors.unauthorized();
        user = data.user;
      }

      if (opts.rateLimit) {
        const who = requireAuth ? user.id : clientIp(req);
        const rl = await rateLimit(`${opts.rateLimit.name}:${who}`, opts.rateLimit.windowSeconds, opts.rateLimit.max);
        if (!rl.allowed) {
          return json(
            { error: { code: "rate_limited", message: `Too many requests. Try again in ${rl.retryAfterSeconds}s.` } },
            { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
          );
        }
      }

      let body = undefined as B;
      if (opts.body) {
        let raw: unknown;
        try {
          raw = await req.json();
        } catch {
          throw errors.badRequest("Request body must be valid JSON.");
        }
        body = opts.body.parse(raw);
      }
      let query = undefined as Q;
      if (opts.query) {
        query = opts.query.parse(Object.fromEntries(req.nextUrl.searchParams));
      }
      const params = (routeCtx ? await routeCtx.params : {}) as P;

      const result = await handler({ req, user, supabase, body, query, params });
      if (result instanceof Response) return result;
      return json(result ?? { ok: true });
    } catch (err) {
      return errorResponse(err, requestId);
    }
  };
}

/** Throws a 404 for "not found or not yours" without revealing which. */
export function must<T>(value: T | null | undefined, message?: string): T {
  if (value === null || value === undefined) throw errors.notFound(message);
  return value;
}

export const uuid = z.uuid();
