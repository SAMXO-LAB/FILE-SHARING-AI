export type FileCategory = "document" | "image" | "audio" | "video" | "archive" | "code" | "data" | "other";

interface TypeInfo {
  category: FileCategory;
  mime: string;
  /** Text we can extract for search. */
  extract?: "pdf" | "docx" | "xlsx" | "pptx" | "text" | "csv" | "json" | "xml" | "html" | "odf" | "epub" | "rtf";
}

/** Extension -> type. Anything not listed is still accepted and stored as an opaque "other" file. */
const EXT: Record<string, TypeInfo> = {
  pdf: { category: "document", mime: "application/pdf", extract: "pdf" },
  txt: { category: "document", mime: "text/plain", extract: "text" },
  md: { category: "document", mime: "text/markdown", extract: "text" },
  rtf: { category: "document", mime: "application/rtf", extract: "rtf" },
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
  // Documents and e-books
  doc: { category: "document", mime: "application/msword" },
  xls: { category: "document", mime: "application/vnd.ms-excel" },
  ppt: { category: "document", mime: "application/vnd.ms-powerpoint" },
  odt: { category: "document", mime: "application/vnd.oasis.opendocument.text", extract: "odf" },
  ods: { category: "document", mime: "application/vnd.oasis.opendocument.spreadsheet", extract: "odf" },
  odp: { category: "document", mime: "application/vnd.oasis.opendocument.presentation", extract: "odf" },
  epub: { category: "document", mime: "application/epub+zip", extract: "epub" },
  pages: { category: "document", mime: "application/vnd.apple.pages" },
  numbers: { category: "document", mime: "application/vnd.apple.numbers" },
  key: { category: "document", mime: "application/vnd.apple.keynote" },
  tex: { category: "document", mime: "text/x-tex", extract: "text" },
  rst: { category: "document", mime: "text/plain", extract: "text" },
  srt: { category: "document", mime: "text/plain", extract: "text" },
  vtt: { category: "document", mime: "text/vtt", extract: "text" },
  eml: { category: "document", mime: "message/rfc822", extract: "text" },
  ics: { category: "data", mime: "text/calendar", extract: "text" },
  vcf: { category: "data", mime: "text/vcard", extract: "text" },
  // Data
  xlsm: { category: "document", mime: "application/vnd.ms-excel.sheet.macroEnabled.12" },
  parquet: { category: "data", mime: "application/vnd.apache.parquet" },
  sqlite: { category: "data", mime: "application/vnd.sqlite3" },
  db: { category: "data", mime: "application/octet-stream" },
  geojson: { category: "data", mime: "application/geo+json", extract: "json" },
  ndjson: { category: "data", mime: "application/x-ndjson", extract: "text" },
  // Images, design and 3D
  ico: { category: "image", mime: "image/x-icon" },
  jfif: { category: "image", mime: "image/jpeg" },
  raw: { category: "image", mime: "image/x-raw" },
  cr2: { category: "image", mime: "image/x-canon-cr2" },
  nef: { category: "image", mime: "image/x-nikon-nef" },
  arw: { category: "image", mime: "image/x-sony-arw" },
  dng: { category: "image", mime: "image/x-adobe-dng" },
  psd: { category: "image", mime: "image/vnd.adobe.photoshop" },
  ai: { category: "image", mime: "application/postscript" },
  eps: { category: "image", mime: "application/postscript" },
  sketch: { category: "image", mime: "application/octet-stream" },
  fig: { category: "image", mime: "application/octet-stream" },
  xcf: { category: "image", mime: "image/x-xcf" },
  stl: { category: "other", mime: "model/stl" },
  obj: { category: "other", mime: "model/obj" },
  fbx: { category: "other", mime: "application/octet-stream" },
  glb: { category: "other", mime: "model/gltf-binary" },
  gltf: { category: "other", mime: "model/gltf+json", extract: "json" },
  blend: { category: "other", mime: "application/octet-stream" },
  // Audio and video
  wma: { category: "audio", mime: "audio/x-ms-wma" },
  aiff: { category: "audio", mime: "audio/aiff" },
  mid: { category: "audio", mime: "audio/midi" },
  midi: { category: "audio", mime: "audio/midi" },
  amr: { category: "audio", mime: "audio/amr" },
  m4v: { category: "video", mime: "video/mp4" },
  wmv: { category: "video", mime: "video/x-ms-wmv" },
  flv: { category: "video", mime: "video/x-flv" },
  "3gp": { category: "video", mime: "video/3gpp" },
  mpg: { category: "video", mime: "video/mpeg" },
  mpeg: { category: "video", mime: "video/mpeg" },
  // Archives and disk images
  rar: { category: "archive", mime: "application/vnd.rar" },
  "7z": { category: "archive", mime: "application/x-7z-compressed" },
  bz2: { category: "archive", mime: "application/x-bzip2" },
  xz: { category: "archive", mime: "application/x-xz" },
  zst: { category: "archive", mime: "application/zstd" },
  iso: { category: "archive", mime: "application/x-iso9660-image" },
  // Fonts
  ttf: { category: "other", mime: "font/ttf" },
  otf: { category: "other", mime: "font/otf" },
  woff: { category: "other", mime: "font/woff" },
  woff2: { category: "other", mime: "font/woff2" },
  // More code and config
  kt: { category: "code", mime: "text/x-kotlin", extract: "text" },
  swift: { category: "code", mime: "text/x-swift", extract: "text" },
  dart: { category: "code", mime: "text/x-dart", extract: "text" },
  scala: { category: "code", mime: "text/x-scala", extract: "text" },
  cs: { category: "code", mime: "text/x-csharp", extract: "text" },
  lua: { category: "code", mime: "text/x-lua", extract: "text" },
  r: { category: "code", mime: "text/x-r", extract: "text" },
  pl: { category: "code", mime: "text/x-perl", extract: "text" },
  vue: { category: "code", mime: "text/plain", extract: "text" },
  svelte: { category: "code", mime: "text/plain", extract: "text" },
  scss: { category: "code", mime: "text/x-scss", extract: "text" },
  less: { category: "code", mime: "text/plain", extract: "text" },
  ini: { category: "code", mime: "text/plain", extract: "text" },
  cfg: { category: "code", mime: "text/plain", extract: "text" },
  conf: { category: "code", mime: "text/plain", extract: "text" },
  env: { category: "code", mime: "text/plain", extract: "text" },
  gradle: { category: "code", mime: "text/plain", extract: "text" },
  dockerfile: { category: "code", mime: "text/plain", extract: "text" },
  graphql: { category: "code", mime: "text/plain", extract: "text" },
  proto: { category: "code", mime: "text/plain", extract: "text" },
  // Programs and installers: stored and shareable, never opened or run by the server.
  exe: { category: "other", mime: "application/x-msdownload" },
  msi: { category: "other", mime: "application/x-msi" },
  dll: { category: "other", mime: "application/x-msdownload" },
  apk: { category: "other", mime: "application/vnd.android.package-archive" },
  aab: { category: "other", mime: "application/octet-stream" },
  ipa: { category: "other", mime: "application/octet-stream" },
  dmg: { category: "other", mime: "application/x-apple-diskimage" },
  pkg: { category: "other", mime: "application/octet-stream" },
  deb: { category: "other", mime: "application/vnd.debian.binary-package" },
  rpm: { category: "other", mime: "application/x-rpm" },
  appimage: { category: "other", mime: "application/octet-stream" },
  jar: { category: "other", mime: "application/java-archive" },
  bat: { category: "code", mime: "text/plain" },
  cmd: { category: "code", mime: "text/plain" },
  ps1: { category: "code", mime: "text/plain" },
  vbs: { category: "code", mime: "text/plain" },
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
  if (m.includes("opendocument") || m === "application/epub+zip" || m.includes("rtf") || m === "application/msword") return "document";
  if (m.includes("zip") || m.includes("tar") || m.includes("gzip") || m.includes("rar") || m.includes("7z")) return "archive";
  if (m.startsWith("text/")) return "code";
  return "other";
}

/**
 * Programs, installers and script launchers. Every file type can be stored and shared, but these are
 * never opened, previewed or run by the server, downloads are always "save as" attachments, and the
 * app shows a warning so people only open them when they trust the sender.
 */
const PROGRAM_EXT = new Set([
  "exe", "dll", "msi", "bat", "cmd", "com", "scr", "pif", "cpl", "vbs", "vbe", "jar", "apk", "aab", "ipa", "app", "dmg", "pkg", "deb", "rpm", "appimage",
  "so", "dylib", "ps1", "psm1", "lnk", "reg", "hta", "msix", "appx", "xlsm", "docm", "pptm",
]);
export function isProgramFile(name: string): boolean {
  return PROGRAM_EXT.has(extensionOf(name));
}
export const PROGRAM_FILE_NOTE = "Program or macro file: stored as-is and never opened by the server. Only open it if you trust where it came from.";

/** Types we render in the in-app preview. Everything else is download-only. */
export type PreviewKind = "image" | "pdf" | "audio" | "video" | "text" | null;
export function previewKind(mime: string | null | undefined, category: FileCategory | string): PreviewKind {
  const m = (mime ?? "").toLowerCase();
  if (m === "application/pdf") return "pdf";
  if (["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"].includes(m)) return "image";
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
