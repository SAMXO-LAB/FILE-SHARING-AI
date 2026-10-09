import { route } from "@/lib/api";

/** Everything currently in flight or recently finished, for the Uploads page and the upload tray. */
export const GET = route({}, async ({ supabase, user }) => {
  const [{ data: active }, { data: problems }, { data: recent }, { data: jobs }] = await Promise.all([
    supabase.from("files").select("id,display_name,size_bytes,category,status,status_detail,created_at,updated_at")
      .eq("owner_id", user.id).eq("purpose", "memory").is("deleted_at", null).in("status", ["uploading", "uploaded", "queued", "processing"])
      .order("created_at", { ascending: false }).limit(100),
    supabase.from("files").select("id,display_name,size_bytes,category,status,status_detail,created_at,updated_at")
      .eq("owner_id", user.id).eq("purpose", "memory").is("deleted_at", null).in("status", ["failed", "unsupported"])
      .order("updated_at", { ascending: false }).limit(100),
    supabase.from("files").select("id,display_name,size_bytes,category,status,status_detail,indexing_level,created_at,updated_at")
      .eq("owner_id", user.id).eq("purpose", "memory").is("deleted_at", null).eq("status", "ready")
      .order("updated_at", { ascending: false }).limit(30),
    supabase.from("processing_jobs").select("id,kind,status,attempts,max_attempts,last_error,created_at").eq("owner_id", user.id).in("status", ["queued", "running", "failed"]).order("created_at", { ascending: false }).limit(50),
  ]);
  return {
    active: active ?? [],
    problems: problems ?? [],
    recent: recent ?? [],
    jobs: jobs ?? [],
    counts: { active: active?.length ?? 0, problems: problems?.length ?? 0 },
  };
});
