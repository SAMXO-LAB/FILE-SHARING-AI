import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { errors } from "@/lib/api";

export interface FriendshipRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "declined" | "blocked";
  blocked_by: string | null;
  created_at: string;
  responded_at: string | null;
  last_message_at: string | null;
}

export interface PublicProfile { id: string; username: string; displayName: string | null; avatar: string | null }

export interface DirectMessageRow {
  id: string;
  friendship_id: string;
  sender_id: string;
  recipient_id: string;
  body: string | null;
  file_id: string | null;
  share_id: string | null;
  file_name: string | null;
  file_size: number | null;
  file_category: string | null;
  file_mime: string | null;
  created_at: string;
  read_at: string | null;
}

export const otherParty = (f: Pick<FriendshipRow, "requester_id" | "addressee_id">, me: string) => (f.requester_id === me ? f.addressee_id : f.requester_id);

/** The minimum identity shown to a friend: username, display name and built-in avatar. */
export async function publicProfiles(admin: SupabaseClient, ids: string[]): Promise<Map<string, PublicProfile>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { data, error } = await admin.from("profiles").select("id,username,display_name,avatar_url").in("id", unique);
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.id as string, { id: p.id as string, username: p.username as string, displayName: (p.display_name as string | null) ?? null, avatar: (p.avatar_url as string | null) ?? null }]));
}

/** Loads a friendship the caller is part of (RLS-scoped client), or 404. */
export async function myFriendship(supabase: SupabaseClient, me: string, id: string): Promise<FriendshipRow> {
  const { data, error } = await supabase.from("friendships").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  const row = data as FriendshipRow | null;
  if (!row || (row.requester_id !== me && row.addressee_id !== me)) throw errors.notFound("That friend wasn't found.");
  return row;
}

/** Finds an account by exact username (case-insensitive), using the service client. */
export async function profileByUsername(admin: SupabaseClient, username: string): Promise<{ id: string; username: string } | null> {
  const { data } = await admin.from("profiles").select("id,username").ilike("username", username.replace(/[\\%_]/g, (m) => `\\${m}`)).maybeSingle();
  return (data as { id: string; username: string } | null) ?? null;
}

/** Turns "table doesn't exist" into a clear setup message (migration 0012 not applied yet). */
export function friendsDbError(e: { code?: string; message?: string }): Error {
  if (e.code === "42P01" || e.code === "PGRST205" || /friendships|direct_messages/.test(e.message ?? "") && /does not exist|schema cache/.test(e.message ?? "")) {
    return errors.notConfigured("Friends isn't set up on this server yet: run supabase/migrations/0012_friends.sql in the Supabase SQL editor.");
  }
  return e as Error;
}
