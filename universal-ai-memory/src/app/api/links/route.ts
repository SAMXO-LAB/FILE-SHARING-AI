import { z } from "zod";
import { route } from "@/lib/api";
import { errors } from "@/lib/api";
import { enqueueJob } from "@/lib/processing/jobs";
import { assertSafeUrlShape, normalizeUrl, UnsafeUrlError } from "@/lib/security/ssrf";
import { adminOrThrow, audit, kickJobs } from "@/lib/server/context";
import { cleanTags, escapeLike } from "@/lib/server/files";

const listQuery = z.object({
  q: z.string().max(200).optional(),
  starred: z.enum(["0", "1"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
  offset: z.coerce.number().int().min(0).default(0),
});

export const GET = route({ query: listQuery }, async ({ supabase, user, query }) => {
  let sel = supabase.from("links").select("*", { count: "exact" }).eq("owner_id", user.id);
  if (query.starred === "1") sel = sel.eq("starred", true);
  if (query.q?.trim()) {
    const like = `%${escapeLike(query.q.trim())}%`;
    sel = sel.or(`title.ilike.${like.replace(/[,()]/g, " ")},url.ilike.${like.replace(/[,()]/g, " ")},description.ilike.${like.replace(/[,()]/g, " ")}`);
  }
  const { data, error, count } = await sel.order("created_at", { ascending: false }).range(query.offset, query.offset + query.limit - 1);
  if (error) throw error;
  return { links: data ?? [], total: count ?? 0 };
});

const body = z.object({
  url: z.string().trim().min(1).max(2048),
  tags: z.array(z.string().max(60)).max(20).optional(),
  summarize: z.boolean().optional(),
});

export const POST = route({ body, rateLimit: { name: "link-save", max: 120, windowSeconds: 600 } }, async ({ body, supabase, user }) => {
  const admin = adminOrThrow();
  // Allow "example.com/page" without a scheme.
  const raw = /^[a-z][a-z0-9+.-]*:/i.test(body.url) ? body.url : `https://${body.url}`;
  let normalized: string;
  try {
    assertSafeUrlShape(raw);
    normalized = normalizeUrl(raw);
  } catch (e) {
    if (e instanceof UnsafeUrlError) throw errors.badRequest(e.reason);
    throw errors.badRequest("That doesn't look like a valid URL.");
  }

  const { data: existing } = await supabase.from("links").select("*").eq("owner_id", user.id).eq("normalized_url", normalized).maybeSingle();
  if (existing) return { link: existing, duplicate: true };

  const { data, error } = await admin
    .from("links")
    .insert({ owner_id: user.id, url: raw, normalized_url: normalized, tags: cleanTags(body.tags ?? []), summary_requested: Boolean(body.summarize) })
    .select("*").single();
  if (error) throw error;
  await enqueueJob(admin, user.id, "process_link", { linkId: data.id }, { dedupeKey: `link:${data.id}` });
  await audit(user.id, "link.saved", { type: "link", id: data.id });
  kickJobs();
  return { link: data, duplicate: false };
});
