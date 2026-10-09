import { route } from "@/lib/api";
import { capabilities } from "@/lib/env";

/** The user's integrations with honest, per-connection status and counts. */
export const GET = route({}, async ({ supabase, user }) => {
  const [{ data: conns, error }, { data: convs }, { data: batches }] = await Promise.all([
    supabase.from("source_connections").select("id,source_id,kind,status,display_name,last_synced_at,last_error,created_at").eq("owner_id", user.id).order("created_at"),
    supabase.from("conversations").select("connection_id,message_count").eq("owner_id", user.id).limit(5000),
    supabase.from("import_batches").select("id,connection_id,status,created_at,completed_at,error").eq("owner_id", user.id).order("created_at", { ascending: false }).limit(200),
  ]);
  if (error) throw error;
  const caps = capabilities();
  const connections = (conns ?? []).map((c) => {
    const mine = (convs ?? []).filter((x) => x.connection_id === c.id);
    const last = (batches ?? []).find((b) => b.connection_id === c.id);
    return {
      ...c,
      conversationCount: mine.length,
      messageCount: mine.reduce((n, x) => n + Number(x.message_count ?? 0), 0),
      lastImport: last ? { status: last.status, at: last.completed_at ?? last.created_at, error: last.error } : null,
    };
  });
  return {
    connections,
    available: {
      whatsapp: { mode: "export_import", automaticSync: false },
      telegramBot: { configured: caps.telegram, botUsername: caps.telegramBotUsername },
      telegramExport: { mode: "export_import" },
      telegramClient: { available: false },
    },
  };
});
