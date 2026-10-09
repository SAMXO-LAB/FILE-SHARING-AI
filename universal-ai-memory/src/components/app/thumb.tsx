"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { TypeIcon } from "./file-visuals";

/** Lazy image thumbnail: fetches a short-lived signed URL only when the tile scrolls into view. Video/other types show an icon (no thumbnails are generated). */
export function Thumb({ id, category, mime, name }: { id: string; category: string; mime: string | null; name: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const isImage = category === "image" && (mime ?? "").startsWith("image/") && !["image/tiff", "image/heic", "image/bmp"].includes(mime ?? "");

  useEffect(() => {
    if (!isImage || !ref.current) return;
    const el = ref.current;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      io.disconnect();
      api<{ url: string }>(`/api/files/${id}/url?mode=preview`).then((r) => setUrl(r.url)).catch(() => setFailed(true));
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [id, isImage]);

  return (
    <div ref={ref} className="grid aspect-square w-full place-items-center overflow-hidden rounded-xl bg-[rgb(var(--line)/0.08)]">
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, not optimizable by next/image
        <img src={url} alt={name} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : <TypeIcon category={category} mime={mime} className="h-14 w-14 [&_svg]:h-7 [&_svg]:w-7" />}
    </div>
  );
}
