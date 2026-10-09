import { z } from "zod";
import { must, route } from "@/lib/api";
import { purgeFiles } from "@/lib/processing/pipeline";
import { adminOrThrow, audit } from "@/lib/server/context";
import { idParams } from "@/lib/validation";

const query = z.object({ deleteData: z.enum(["0", "1"]).default("0") });

/**
 * Disconnects an integration. With deleteData=1 every conversation, message, attachment file and
 * index entry that came through it is deleted as well; otherwise imported data stays in your memory.
 */
export const DELETE = route<undefined, z.infer<typeof query>, { id: string }>({ query, rateLimit: { name: "integration-delete", max: 20, windowSeconds: 3600 } }, async ({ query, supabase, user, params }) => {
  const { id } = idParams.parse(params);
  const { data } = await supabase.from("source_connections").select("id,kind").eq("id", id).eq("owner_id", user.id).maybeSingle();
  const conn = must(data);
  const admin = adminOrThrow();

  // Stop accepting new data first (frees the Telegram chat for re-linking).
  await admin.from("source_connections").update({ status: "disconnected", external_id: null }).eq("id", id);

  let deleted = { conversations: 0, files: 0 };
  if (query.deleteData === "1") {
    const { data: convs } = await admin.from("conversations").select("id").eq("owner_id", user.id).eq("connection_id", id);
    const convIds = (convs ?? []).map((c) => c.id as string);
    if (convIds.length) {
      const { data: files } = await admin.from("files").select("id").eq("owner_id", user.id).in("conversation_id", convIds);
      deleted.files = await purgeFiles(admin, user.id, (files ?? []).map((f) => f.id as string));
      await admin.from("conversations").delete().eq("owner_id", user.id).in("id", convIds);
      deleted.conversations = convIds.length;
    }
    await admin.from("import_batches").delete().eq("owner_id", user.id).eq("connection_id", id);
  }
  await admin.from("source_connections").delete().eq("id", id).eq("owner_id", user.id);
  await audit(user.id, "integration.disconnected", { type: "source_connection", id }, { kind: conn.kind, deletedData: query.deleteData === "1", ...deleted });
  return { ok: true, deleted };
});
