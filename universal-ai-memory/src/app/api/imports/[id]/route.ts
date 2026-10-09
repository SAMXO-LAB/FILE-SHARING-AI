import { z } from "zod";
import { must, route } from "@/lib/api";
import { reindexConversation } from "@/lib/imports/runner";
import { purgeFiles } from "@/lib/processing/pipeline";
import { adminOrThrow, audit } from "@/lib/server/context";
import { idParams } from "@/lib/validation";

type P = { id: string };

export const GET = route<undefined, undefined, P>({}, async ({ supabase, user, params }) => {
  const { id } = idParams.parse(params);
  const { data } = await supabase.from("import_batches").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle();
  return { batch: must(data) };
});

const query = z.object({ deleteData: z.enum(["0", "1"]).default("0") });

/**
 * Removes an import's history entry. With deleteData=1 it also deletes the messages and files this
 * import added (conversations left empty are removed; others are re-indexed from what remains).
 */
export const DELETE = route<undefined, z.infer<typeof query>, P>({ query }, async ({ query, supabase, user, params }) => {
  const { id } = idParams.parse(params);
  const { data } = await supabase.from("import_batches").select("id,status").eq("id", id).eq("owner_id", user.id).maybeSingle();
  must(data);
  const admin = adminOrThrow();
  let removedMessages = 0;

  if (query.deleteData === "1") {
    const { data: files } = await admin.from("files").select("id").eq("owner_id", user.id).eq("import_batch_id", id);
    await purgeFiles(admin, user.id, (files ?? []).map((f) => f.id as string));

    const { data: msgs } = await admin.from("messages").select("conversation_id").eq("owner_id", user.id).eq("import_batch_id", id).limit(100000);
    const convIds = [...new Set((msgs ?? []).map((m) => m.conversation_id as string))];
    const { count } = await admin.from("messages").delete({ count: "exact" }).eq("owner_id", user.id).eq("import_batch_id", id);
    removedMessages = count ?? 0;
    for (const convId of convIds) {
      const { count: left } = await admin.from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", convId);
      if (!left) {
        await admin.from("conversations").delete().eq("id", convId).eq("owner_id", user.id);
      } else {
        await admin.rpc("renumber_conversation", { p_conversation: convId });
        await admin.rpc("refresh_conversation_stats", { p_conversation: convId });
        await reindexConversation(admin, convId);
      }
    }
    await admin.from("memory_records").delete().eq("owner_id", user.id).eq("import_batch_id", id);
  }
  const { error } = await supabase.from("import_batches").delete().eq("id", id).eq("owner_id", user.id);
  if (error) throw error;
  await audit(user.id, "import.deleted", { type: "import_batch", id }, { deletedData: query.deleteData === "1", removedMessages });
  return { ok: true, removedMessages };
});
