import { route } from "@/lib/api";
import { limits } from "@/lib/env";

export const GET = route({}, async ({ supabase, user }) => {
  const [{ data: prof }, { data: files }] = await Promise.all([
    supabase.from("profiles").select("storage_quota_bytes,max_upload_bytes").eq("id", user.id).single(),
    supabase.from("files").select("size_bytes,category,deleted_at,purpose").eq("owner_id", user.id).limit(20000),
  ]);
  const byCategory: Record<string, number> = {};
  let used = 0;
  let trash = 0;
  for (const f of (files ?? []) as { size_bytes: number; category: string; deleted_at: string | null; purpose: string }[]) {
    const size = Number(f.size_bytes);
    used += size;
    if (f.deleted_at) trash += size;
    else byCategory[f.purpose === "import_source" ? "import" : f.category] = (byCategory[f.purpose === "import_source" ? "import" : f.category] ?? 0) + size;
  }
  return {
    usedBytes: used,
    trashBytes: trash,
    quotaBytes: Number(prof?.storage_quota_bytes ?? limits.defaultQuotaBytes),
    maxUploadBytes: Math.min(Number(prof?.max_upload_bytes ?? limits.maxUploadBytes), limits.maxUploadBytes),
    byCategory,
  };
});
