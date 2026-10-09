import { z } from "zod";
import { route } from "@/lib/api";

const query = z.object({
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
  types: z.string().max(80).optional(), // comma-separated: file,link,note,conversation
});

interface Item {
  type: "file" | "link" | "note" | "conversation";
  id: string;
  title: string;
  at: string;
  atKind: "uploaded" | "saved" | "created" | "imported";
  detail: string | null;
  category: string | null;
  mime: string | null;
  sourceId: string;
}

/**
 * Chronological view of what was added to memory. Dates are real timestamps only: when an item
 * was added, plus its original date (e.g. a chat's last message) as detail when one is known.
 * Items without a known date never appear here.
 */
export const GET = route({ query }, async ({ supabase, user, query: q }) => {
  const want = new Set((q.types ? q.types.split(",") : ["file", "link", "note", "conversation"]));
  const before = q.before ?? new Date(Date.now() + 60_000).toISOString();
  const n = q.limit;
  const items: Item[] = [];

  const jobs: PromiseLike<void>[] = [];
  if (want.has("file")) {
    jobs.push(supabase.from("files").select("id,display_name,created_at,original_date,category,mime_type,source_id").eq("owner_id", user.id).eq("purpose", "memory").is("deleted_at", null).lt("created_at", before).order("created_at", { ascending: false }).limit(n)
      .then(({ data }) => { for (const f of data ?? []) items.push({ type: "file", id: f.id, title: f.display_name, at: f.created_at, atKind: "uploaded", detail: f.original_date ? `Original date ${String(f.original_date).slice(0, 10)}` : null, category: f.category, mime: f.mime_type, sourceId: f.source_id }); }));
  }
  if (want.has("link")) {
    jobs.push(supabase.from("links").select("id,title,url,created_at").eq("owner_id", user.id).lt("created_at", before).order("created_at", { ascending: false }).limit(n)
      .then(({ data }) => { for (const l of data ?? []) items.push({ type: "link", id: l.id, title: l.title ?? l.url, at: l.created_at, atKind: "saved", detail: null, category: null, mime: null, sourceId: "link" }); }));
  }
  if (want.has("note")) {
    jobs.push(supabase.from("notes").select("id,title,created_at").eq("owner_id", user.id).lt("created_at", before).order("created_at", { ascending: false }).limit(n)
      .then(({ data }) => { for (const x of data ?? []) items.push({ type: "note", id: x.id, title: x.title, at: x.created_at, atKind: "created", detail: null, category: null, mime: null, sourceId: "note" }); }));
  }
  if (want.has("conversation")) {
    jobs.push(supabase.from("conversations").select("id,title,created_at,message_count,last_message_at,source_id").eq("owner_id", user.id).lt("created_at", before).order("created_at", { ascending: false }).limit(n)
      .then(({ data }) => { for (const c of data ?? []) items.push({ type: "conversation", id: c.id, title: c.title, at: c.created_at, atKind: "imported", detail: `${c.message_count} messages${c.last_message_at ? ` · last message ${String(c.last_message_at).slice(0, 10)}` : ""}`, category: null, mime: null, sourceId: c.source_id }); }));
  }
  await Promise.all(jobs);
  items.sort((a, b) => b.at.localeCompare(a.at));
  const page = items.slice(0, n);
  return { items: page, nextBefore: items.length > n ? page[page.length - 1]?.at ?? null : null };
});
