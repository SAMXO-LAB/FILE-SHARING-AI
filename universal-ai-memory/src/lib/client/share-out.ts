"use client";
import { api } from "@/lib/client/api";

/**
 * Sharing outside Share Files AI uses the device's own share sheet (Web Share API). On phones that
 * sheet includes WhatsApp, Gmail and the like, plus Quick Share / Nearby Share (Android) and AirDrop
 * (Apple), which send over Bluetooth and Wi-Fi to devices close by. Websites can't use Bluetooth or
 * Wi-Fi Direct themselves, so this is the supported route.
 */
export function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function" || typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [new File(["x"], "x.txt", { type: "text/plain" })] });
  } catch {
    return false;
  }
}

export type ShareOutcome = "shared" | "cancelled" | "downloaded";

/** Opens the share sheet for local files; falls back to downloading them when sharing isn't supported. */
export async function shareFilesOut(files: File[], text?: string): Promise<ShareOutcome> {
  if (canShareFiles() && navigator.canShare({ files })) {
    try {
      await navigator.share({ files, title: files.length === 1 ? files[0]!.name : `${files.length} files`, text });
      return "shared";
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return "cancelled";
      throw e;
    }
  }
  for (const f of files) {
    const url = URL.createObjectURL(f);
    const a = Object.assign(document.createElement("a"), { href: url, download: f.name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
  return "downloaded";
}

const MAX_SHARE_BYTES = 200 * 1024 * 1024;

/** Fetches a stored file (owned or shared with you) and hands it to the share sheet. */
export async function shareStoredFileOut(fileId: string, name: string, mime?: string | null, size?: number | null): Promise<ShareOutcome> {
  if (size && size > MAX_SHARE_BYTES) throw new Error("This file is too large to pass to other apps from the browser. Download it first, then share it from your device.");
  const { url } = await api<{ url: string }>(`/api/files/${fileId}/url?mode=download`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't read the file (HTTP ${res.status}).`);
  const blob = await res.blob();
  const file = new File([blob], name, { type: mime || blob.type || "application/octet-stream" });
  return shareFilesOut([file]);
}
