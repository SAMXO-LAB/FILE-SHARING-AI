import { route } from "@/lib/api";
import { ownFile } from "@/lib/server/files";
import { idParams } from "@/lib/validation";

export const POST = route<undefined, undefined, { id: string }>({}, async ({ supabase, user, params }) => {
  const { id } = idParams.parse(params);
  await ownFile(supabase, user.id, id);
  const { data, error } = await supabase.from("files").update({ deleted_at: null }).eq("id", id).eq("owner_id", user.id).select("*").single();
  if (error) throw error;
  return { file: data };
});
