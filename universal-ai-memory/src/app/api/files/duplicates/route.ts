import { route } from "@/lib/api";

/** Groups of files with identical content (SHA-256). Fingerprints are per user and never compared across users. */
export const GET = route({}, async ({ supabase, user }) => {
  const { data, error } = await supabase
    .from("files")
    .select("id,display_name,size_bytes,content_hash,created_at,folder_id,category")
    .eq("owner_id", user.id).eq("purpose", "memory").is("deleted_at", null).not("content_hash", "is", null)
    .order("created_at", { ascending: true })
    .limit(5000);
  if (error) throw error;
  const groups = new Map<string, typeof data>();
  for (const f of data ?? []) groups.set(f.content_hash as string, [...(groups.get(f.content_hash as string) ?? []), f]);
  const dupes = [...groups.entries()].filter(([, v]) => (v?.length ?? 0) > 1).map(([hash, files]) => ({ hash, files }));
  const wasted = dupes.reduce((n, g) => n + g.files.slice(1).reduce((m, f) => m + Number(f.size_bytes), 0), 0);
  return { groups: dupes, reclaimableBytes: wasted };
});
