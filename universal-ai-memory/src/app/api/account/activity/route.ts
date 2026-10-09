import { route } from "@/lib/api";
import { adminOrThrow } from "@/lib/server/context";

const OWN = [
  "account.password_changed", "auth.password_changed", "profile.username_changed", "privacy.processing_mode_changed", "account.exported",
  "share.created", "share.accepted", "share.declined", "share.revoked", "integration.telegram_link_code_created", "integration.disconnected",
  "files.reindex_all", "import.deleted",
];

/**
 * Recent security-relevant activity on the caller's account:
 *  - the caller's own events (read through RLS), and
 *  - views/downloads by other people of files the caller shared (found by the `owner` recorded when the
 *    share was used; shown with the viewer's username, who by definition has an accepted share).
 */
export const GET = route({ rateLimit: { name: "account-activity", max: 60, windowSeconds: 600 } }, async ({ supabase, user }) => {
  const { data: own, error } = await supabase
    .from("audit_events").select("id,event,metadata,created_at").eq("user_id", user.id).in("event", OWN).order("created_at", { ascending: false }).limit(25);
  if (error) throw error;

  const admin = adminOrThrow();
  const { data: seen } = await admin
    .from("audit_events").select("id,event,user_id,target_id,created_at").in("event", ["share.file_viewed", "share.file_downloaded"])
    .eq("metadata->>owner", user.id).neq("user_id", user.id).order("created_at", { ascending: false }).limit(25);
  const viewerIds = [...new Set((seen ?? []).map((r) => r.user_id as string).filter(Boolean))];
  const fileIds = [...new Set((seen ?? []).map((r) => r.target_id as string).filter(Boolean))];
  const [{ data: profiles }, { data: files }] = await Promise.all([
    viewerIds.length ? admin.from("profiles").select("id,username").in("id", viewerIds) : { data: [] },
    fileIds.length ? admin.from("files").select("id,display_name").eq("owner_id", user.id).in("id", fileIds) : { data: [] },
  ]);
  const U = new Map((profiles ?? []).map((p) => [p.id as string, p.username as string]));
  const F = new Map((files ?? []).map((f) => [f.id as string, f.display_name as string]));
  const others = (seen ?? []).map((r) => ({
    id: r.id as string, event: r.event as string, created_at: r.created_at as string,
    metadata: { viewer: U.get(r.user_id as string) ?? null, file: F.get(r.target_id as string) ?? null },
  }));

  const events = [...(own ?? []).map((e) => ({ id: e.id as string, event: e.event as string, created_at: e.created_at as string, metadata: (e.metadata ?? {}) as Record<string, unknown> })), ...others]
    .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 30);
  return { events };
});
