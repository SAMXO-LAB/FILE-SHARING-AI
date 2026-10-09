import { route } from "@/lib/api";
import { capabilities } from "@/lib/env";

/** Real counts for the dashboard. Nothing is invented: a new account gets zeros and an onboarding state. */
export const GET = route({}, async ({ supabase, user }) => {
  const count = async (table: string, f: (q: any) => any = (q) => q) => {
    const { count: n } = await f(supabase.from(table).select("id", { count: "exact", head: true }).eq("owner_id", user.id));
    return n ?? 0;
  };
  const live = (q: any) => q.eq("purpose", "memory").is("deleted_at", null);
  const [files, images, videos, documents, pdfs, links, notes, conversations, collections, processing, failed, shares] = await Promise.all([
    count("files", live),
    count("files", (q) => live(q).eq("category", "image")),
    count("files", (q) => live(q).eq("category", "video")),
    count("files", (q) => live(q).in("category", ["document", "data", "code"])),
    count("files", (q) => live(q).eq("mime_type", "application/pdf")),
    count("links"),
    count("notes"),
    count("conversations"),
    count("collections"),
    count("files", (q) => live(q).in("status", ["uploading", "uploaded", "queued", "processing"])),
    count("files", (q) => live(q).in("status", ["failed", "unsupported"])),
    supabase.from("sharing_permissions").select("id", { count: "exact", head: true }).eq("recipient_id", user.id).eq("status", "pending").then((r) => r.count ?? 0),
  ]);
  const caps = capabilities();
  return {
    counts: { files, images, videos, documents, pdfs, links, notes, conversations, collections, processing, failed, pendingShares: shares },
    total: files + links + notes + conversations,
    ai: caps.ai,
  };
});
