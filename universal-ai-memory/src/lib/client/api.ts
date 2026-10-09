"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export class ApiClientError extends Error {
  constructor(message: string, public status: number, public code: string, public details?: unknown) {
    super(message);
  }
}

interface ApiInit {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

/** Fetch wrapper for our JSON API: throws ApiClientError with a user-presentable message. */
export async function api<T = unknown>(url: string, init: ApiInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
      credentials: "same-origin",
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiClientError("Couldn't reach the server. Check your connection and try again.", 0, "network");
  }
  const contentType = res.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json") ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload so the new session cookie is picked up
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    }
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    throw new ApiClientError(err?.message ?? `Request failed (${res.status}).`, res.status, err?.code ?? "error", err?.details);
  }
  return data as T;
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

/** Minimal data hook: loads on mount / when `url` changes, exposes reload and optimistic setData. */
export function useFetch<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const seq = useRef(0);

  const load = useCallback(async (silent = false) => {
    if (!url) return;
    const id = ++seq.current;
    if (!silent) setLoading(true);
    try {
      const d = await api<T>(url);
      if (id !== seq.current) return;
      setData(d);
      setError(null);
    } catch (e) {
      if (id !== seq.current) return;
      setError(errorMessage(e));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void load();
    const counter = seq;
    return () => { counter.current++; };
  }, [load]);

  return { data, error, loading, reload: () => load(true), reloadWithSpinner: () => load(false), setData };
}

/** SHA-256 of a (small) file, hex. Used only for a friendly duplicate warning before uploading. */
export async function sha256Hex(file: Blob): Promise<string | null> {
  try {
    if (!globalThis.crypto?.subtle) return null;
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}
