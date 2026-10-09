import "server-only";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const BUCKET = "memory-files";

/** Server-side object helpers. All callers must have authorised the key (owner/share check) first. */

export async function objectSize(admin: SupabaseClient, key: string): Promise<{ size: number; contentType: string | null } | null> {
  const { data, error } = await admin.storage.from(BUCKET).info(key);
  if (error || !data) return null;
  return { size: Number(data.size ?? 0), contentType: data.contentType ?? null };
}

export async function downloadObject(admin: SupabaseClient, key: string): Promise<Uint8Array> {
  const { data, error } = await admin.storage.from(BUCKET).download(key);
  if (error || !data) throw new Error(`Could not read the stored file (${error?.message ?? "unknown error"}).`);
  return new Uint8Array(await data.arrayBuffer());
}

export async function signedUrl(
  admin: SupabaseClient,
  key: string,
  expiresIn: number,
  opts: { download?: string | boolean } = {},
): Promise<string> {
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(key, expiresIn, opts.download !== undefined ? { download: opts.download } : undefined);
  if (error || !data?.signedUrl) throw new Error("Could not create a download link.");
  return data.signedUrl;
}

/** Reads the first bytes of an object using an HTTP Range request over a short-lived signed URL. */
export async function readHead(admin: SupabaseClient, key: string, bytes = 4096): Promise<Uint8Array> {
  const url = await signedUrl(admin, key, 60);
  const res = await fetch(url, { headers: { Range: `bytes=0-${bytes - 1}` } });
  if (!res.ok && res.status !== 206) throw new Error(`Could not read the uploaded file (HTTP ${res.status}).`);
  const buf = new Uint8Array(await res.arrayBuffer());
  return buf.subarray(0, bytes);
}

/** Streams an object through SHA-256 without holding it in memory. */
export async function hashObject(admin: SupabaseClient, key: string): Promise<{ sha256: string; size: number }> {
  const url = await signedUrl(admin, key, 300);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Could not read the stored file (HTTP ${res.status}).`);
  const h = crypto.createHash("sha256");
  let size = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    h.update(value);
    size += value.byteLength;
  }
  return { sha256: h.digest("hex"), size };
}

export async function removeObjects(admin: SupabaseClient, keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += 100) {
    const batch = keys.slice(i, i + 100);
    const { error } = await admin.storage.from(BUCKET).remove(batch);
    if (error) throw new Error(`Could not delete stored files (${error.message}).`);
  }
}

export async function uploadBytes(
  admin: SupabaseClient,
  key: string,
  bytes: Uint8Array | Blob,
  contentType: string,
): Promise<void> {
  const { error } = await admin.storage.from(BUCKET).upload(key, bytes, { contentType, upsert: false });
  if (error) throw new Error(`Could not store the file (${error.message}).`);
}

export async function copyObject(admin: SupabaseClient, from: string, to: string): Promise<void> {
  const { error } = await admin.storage.from(BUCKET).copy(from, to);
  if (error) throw new Error(`Could not copy the file (${error.message}).`);
}

/** Lists all object keys under an owner's prefix (for account deletion / export). */
export async function listOwnerObjects(admin: SupabaseClient, ownerId: string): Promise<string[]> {
  const keys: string[] = [];
  for (const folder of [ownerId, `${ownerId}/_derived`]) {
    let offset = 0;
    for (;;) {
      const { data, error } = await admin.storage.from(BUCKET).list(folder, { limit: 1000, offset });
      if (error) throw new Error(`Could not list stored files (${error.message}).`);
      if (!data || data.length === 0) break;
      for (const o of data) if (o.id) keys.push(`${folder}/${o.name}`);
      if (data.length < 1000) break;
      offset += 1000;
    }
  }
  return keys;
}
