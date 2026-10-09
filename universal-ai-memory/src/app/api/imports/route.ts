import { route } from "@/lib/api";

export const GET = route({}, async ({ supabase, user }) => {
  const { data, error } = await supabase
    .from("import_batches")
    .select("id,source_id,kind,status,display_name,stats,warnings,error,created_at,completed_at,connection_id")
    .eq("owner_id", user.id).order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  return { batches: data ?? [] };
});
