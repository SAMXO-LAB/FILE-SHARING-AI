"use client";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/client/api";
import { previewKind } from "@/lib/files/types";

/**
 * Previews run on short-lived signed URLs. PDFs open in the browser's own viewer in a new tab
 * (isolated from this app) rather than inside our page.
 */
export function FilePreview({ fileId, mime, category, name }: { fileId: string; mime: string | null; category: string; name: string }) {
  const kind = previewKind(mime, category);
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<{ text: string; truncated: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retried, setRetried] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      if (kind === "text") setText(await api(`/api/files/${fileId}/url?mode=text`));
      else if (kind) setUrl((await api<{ url: string }>(`/api/files/${fileId}/url?mode=preview`)).url);
    } catch (e) { setError(errorMessage(e)); }
  }, [fileId, kind]);

  useEffect(() => { setUrl(null); setText(null); setRetried(false); void load(); }, [load]);

  // Signed URLs expire; fetch a fresh one once if the media fails to load.
  const onMediaError = () => { if (!retried) { setRetried(true); void load(); } else setError("The preview couldn't be loaded."); };

  if (!kind) return <div className="panel flex items-center gap-3 p-4 text-sm text-muted"><FileQuestion className="h-5 w-5" aria-hidden />There's no in-app preview for this type of file. You can download it instead.</div>;
  if (error) return <p role="alert" className="panel p-4 text-sm text-danger">{error}</p>;
  if (kind === "text") return text ? (
    <div><pre className="panel max-h-[50vh] overflow-auto whitespace-pre-wrap break-words p-4 text-xs leading-relaxed">{text.text}</pre>{text.truncated && <p className="mt-1.5 text-xs text-muted">Showing the first part of the file.</p>}</div>
  ) : <Skeleton className="h-48" />;
  if (!url) return <Skeleton className="h-56" />;
  switch (kind) {
    case "image": return <div className="panel grid place-items-center overflow-hidden p-2">{/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}<img src={url} alt={name} onError={onMediaError} className="max-h-[55vh] w-auto max-w-full rounded-lg object-contain" /></div>;
    case "video": return <video src={url} controls preload="metadata" onError={onMediaError} className="max-h-[55vh] w-full rounded-xl bg-black" aria-label={name} />;
    case "audio": return <audio src={url} controls preload="metadata" onError={onMediaError} className="w-full" aria-label={name} />;
    case "pdf": return <div className="panel flex flex-wrap items-center gap-3 p-4 text-sm"><span className="flex-1 text-muted">PDFs open in your browser's viewer in a new tab.</span><Button asChild variant="glass" size="sm"><a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" aria-hidden />Open PDF</a></Button></div>;
  }
}
