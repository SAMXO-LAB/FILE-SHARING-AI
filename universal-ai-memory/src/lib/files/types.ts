export type FileCategory = "document" | "image" | "audio" | "video" | "archive" | "code" | "data" | "other";

interface TypeInfo {
  category: FileCategory;
  mime: string;
  /** Text we can extract for search. */
  extract?: "pdf" | "docx" | "xlsx" | "pptx" | "text" | "csv" | "json" | "xml" | "html";
}

/** Extension -> type. Anything not listed is still accepted as an opaque "other" file when safe. */
const EXT: Record<string, TypeInfo> = {
  pdf: { category: "document", mime: "application/pdf", extract: "pdf" },
  txt: { category: "document", mime: "text/plain", extract: "text" },
  md: { category: "document", mime: "text/markdown", extract: "text" },
  rtf: { category: "document", mime: "application/rtf" },
  docx: { category: "document", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extract: "docx" },
  xlsx: { category: "document", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extract: "xlsx" },
  pptx: { category: "document", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", extract: "pptx" },
  csv: { category: "data", mime: "text/csv", extract: "csv" },
  tsv: { category: "data", mime: "text/tab-separated-values", extract: "csv" },
  json: { category: "data", mime: "application/json", extract: "json" },
  xml: { category: "data", mime: "application/xml", extract: "xml" },
  jpg: { category: "image", mime: "image/jpeg" },
  jpeg: { category: "image", mime: "image/jpeg" },
  png: { category: "image", mime: "image/png" },
  webp: { category: "image", mime: "image/webp" },
  gif: { category: "image", mime: "image/gif" },
  bmp: { category: "image", mime: "image/bmp" },
  tif: { category: "image", mime: "image/tiff" },
  tiff: { category: "image", mime: "image/tiff" },
  heic: { category: "image", mime: "image/heic" },
  avif: { category: "image", mime: "image/avif" },
  svg: { category: "image", mime: "image/svg+xml" },
  mp3: { category: "audio", mime: "audio/mpeg" },
  wav: { category: "audio", mime: "audio/wav" },
  m4a: { category: "audio", mime: "audio/mp4" },
  aac: { category: "audio", mime: "audio/aac" },
  ogg: { category: "audio", mime: "audio/ogg" },
  opus: { category: "audio", mime: "audio/ogg" },
  flac: { category: "audio", mime: "audio/flac" },
  mp4: { category: "video", mime: "video/mp4" },
  webm: { category: "video", mime: "video/webm" },
  mov: { category: "video", mime: "video/quicktime" },
  mkv: { category: "video", mime: "video/x-matroska" },
  avi: { category: "video", mime: "video/x-msvideo" },
  zip: { category: "archive", mime: "application/zip" },
  tar: { category: "archive", mime: "application/x-tar" },
  gz: { category: "archive", mime: "application/gzip" },
  tgz: { category: "archive", mime: "application/gzip" },
  py: { category: "code", mime: "text/x-python", extract: "text" },
  js: { category: "code", mime: "text/javascript", extract: "text" },
  mjs: { category: "code", mime: "text/javascript", extract: "text" },
  ts: { category: "code", mime: "text/typescript", extract: "text" },
  tsx: { category: "code", mime: "text/typescript", extract: "text" },
  jsx: { category: "code", mime: "text/javascript", extract: "text" },
  html: { category: "code", mime: "text/html", extract: "html" },
  htm: { category: "code", mime: "text/html", extract: "html" },
  css: { category: "code", mime: "text/css", extract: "text" },
  sql: { category: "code", mime: "application/sql", extract: "text" },
  sh: { category: "code", mime: "text/x-shellscript", extract: "text" },
  java: { category: "code", mime: "text/x-java", extract: "text" },
  c: { category: "code", mime: "text/x-c", extract: "text" },
  h: { category: "code", mime: "text/x-c", extract: "text" },
  cpp: { category: "code", mime: "text/x-c++", extract: "text" },
  go: { category: "code", mime: "text/x-go", extract: "text" },
  rs: { category: "code", mime: "text/x-rust", extract: "text" },
  rb: { category: "code", mime: "text/x-ruby", extract: "text" },
  php: { category: "code", mime: "text/x-php", extract: "text" },
  yml: { category: "code", mime: "text/yaml", extract: "text" },
  yaml: { category: "code", mime: "text/yaml", extract: "text" },
  toml: { category: "code", mime: "text/plain", extract: "text" },
  ipynb: { category: "code", mime: "application/json", extract: "json" },
  log: { category: "document", mime: "text/plain", extract: "text" },
};

export function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function typeFromName(name: string, declaredMime?: string | null): TypeInfo {
  const known = EXT[extensionOf(name)];
  if (known) return known;
  const m = (declaredMime ?? "").toLowerCase();
  if (m.startsWith("image/")) return { category: "image", mime: m };
  if (m.startsWith("audio/")) return { category: "audio", mime: m };
  if (m.startsWith("video/")) return { category: "video", mime: m };
  if (m.startsWith("text/")) return { category: "document", mime: m, extract: "text" };
  return { category: "other", mime: m || "application/octet-stream" };
}

export function categoryFromMime(mime: string | null | undefined): FileCategory {
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/")) return "video";
  if (m === "application/pdf" || m.includes("officedocument") || m === "text/plain" || m === "text/markdown") return "document";
  if (m === "text/csv" || m === "application/json" || m === "application/xml" || m === "text/xml") return "data";
  if (m.includes("zip") || m.includes("tar") || m.includes("gzip")) return "archive";
  if (m.startsWith("text/")) return "code";
  return "other";
}

/** Executables and similar: never accepted. */
const BLOCKED_EXT = new Set([
  "exe", "dll", "msi", "bat", "cmd", "com", "scr", "pif", "cpl", "vbs", "vbe", "jar", "apk", "app", "dmg", "so", "dylib", "ps1", "lnk", "reg", "hta",
]);
export function isBlockedExtension(name: string): boolean {
  return BLOCKED_EXT.has(extensionOf(name));
}

/** Types we render in the in-app preview. Everything else is download-only. */
export type PreviewKind = "image" | "pdf" | "audio" | "video" | "text" | null;
export function previewKind(mime: string | null | undefined, category: FileCategory | string): PreviewKind {
  const m = (mime ?? "").toLowerCase();
  if (m === "application/pdf") return "pdf";
  if (m.startsWith("image/") && m !== "image/tiff" && m !== "image/heic" && m !== "image/bmp") return "image";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/") && (m === "video/mp4" || m === "video/webm" || m === "video/quicktime")) return "video";
  if (category === "code" || category === "data" || m === "text/plain" || m === "text/markdown") return "text";
  return null;
}

export function humanSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

/** Strips path separators and control characters so names are safe to store and display. */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]+/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 255);
  return cleaned || "untitled";
}
