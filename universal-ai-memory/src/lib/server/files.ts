import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { errors, must } from "@/lib/api";
import type { FileRow } from "@/lib/types";

/** Loads a memory file the caller OWNS (through RLS plus an explicit owner check). */
export async function ownFile(supabase: SupabaseClient, userId: string, id: string): Promise<FileRow> {
  const { data, error } = await supabase
    .from("files")
    .select("*")
    .eq("id", id)
    .eq("owner_id", userId)
    .eq("purpose", "memory")
    .maybeSingle();
  if (error) throw error;
  return must(data as FileRow | null);
}

export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export function cleanTags(tags: string[]): string[] {
  const seen = new Set<string>();
  for (const t of tags) {
    const v = t.replace(/[\u0000-\u001f\u007f]/g, "").trim().toLowerCase().slice(0, 40);
    if (v) seen.add(v);
  }
  return [...seen].slice(0, 20);
}

export function requireUploadedObject(file: FileRow) {
  if (file.status === "uploading") throw errors.conflict("That file hasn't finished uploading.");
}
