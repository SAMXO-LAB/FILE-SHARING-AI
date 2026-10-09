import type { SupabaseClient } from "@supabase/supabase-js";
import { route } from "@/lib/api";
import { audit } from "@/lib/server/context";

const PAGE = 1000;
const MAX_ROWS = 200_000;

async function all(supabase: SupabaseClient, table: string, column: string, owner: string, select = "*", orderBy = "created_at") {
  const rows: unknown[] = [];
  let truncated = false;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(select).eq(column, owner).order(orderBy, { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
    if (rows.length >= MAX_ROWS) { truncated = true; break; }
  }
  return { rows, truncated };
}

/**
 * A portable JSON export of everything stored about you, read through your own session (so it can
 * only ever contain your rows). File bytes are not inlined; download files individually or from
 * a share/zip tool of your choice. Embeddings are omitted: they're derived data.
 */
export const GET = route({ rateLimit: { name: "account-export", max: 3, windowSeconds: 3600 } }, async ({ supabase, user }) => {
  const tables: [string, string, string?, string?][] = [
    ["profiles", "id"], ["user_preferences", "user_id", "*", "updated_at"], ["user_themes", "user_id", "*", "created_at"],
    ["source_connections", "owner_id"], ["import_batches", "owner_id"], ["folders", "owner_id"],
    ["files", "owner_id"], ["conversations", "owner_id"], ["messages", "owner_id"], ["links", "owner_id"], ["notes", "owner_id"],
    ["collections", "owner_id"], ["collection_items", "owner_id", "*", "added_at"],
    ["ai_conversations", "owner_id"], ["ai_messages", "owner_id"], ["search_history", "owner_id"],
    ["sharing_permissions", "owner_id"], ["audit_events", "user_id"],
  ];
  const out: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    account: { id: user.id, email: user.email },
    notes: "File contents are not included in this JSON. 'files' lists metadata, tags and AI-generated summaries. Semantic embeddings are omitted because they are derived data.",
  };
  const truncated: string[] = [];
  for (const [table, col, select, order] of tables) {
    const r = await all(supabase, table, col, user.id, select ?? "*", order ?? "created_at").catch(async () => all(supabase, table, col, user.id, select ?? "*", "id"));
    out[table] = r.rows;
    if (r.truncated) truncated.push(table);
  }
  if (truncated.length) out.truncatedTables = truncated;
  await audit(user.id, "account.exported", { type: "profile", id: user.id });
  const name = `memory-export-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(JSON.stringify(out, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
});
