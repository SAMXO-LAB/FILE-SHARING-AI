/**
 * Content sniffing. We never trust the browser-declared MIME type or the extension alone.
 * Returns the type implied by the file's leading bytes, or null when unknown.
 */
export interface SniffResult {
  mime: string | null;
  /** True for native executables (stored as opaque files, never parsed or previewed). */
  executable: boolean;
  /** True when the leading bytes look like (mostly) valid text. */
  text: boolean;
}

function startsWith(b: Uint8Array, sig: number[], offset = 0): boolean {
  return sig.every((v, i) => b[offset + i] === v);
}
function ascii(b: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...b.subarray(from, Math.min(to, b.length)));
}

export function looksLikeText(b: Uint8Array): boolean {
  if (b.length === 0) return true;
  let suspicious = 0;
  const n = Math.min(b.length, 4096);
  for (let i = 0; i < n; i++) {
    const c = b[i]!;
    if (c === 0) return false;
    if (c < 7 || (c > 13 && c < 32 && c !== 27)) suspicious++;
  }
  if (suspicious / n > 0.05) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(b.subarray(0, n - (n < b.length ? 4 : 0)));
    return true;
  } catch {
    // Not valid UTF-8; accept UTF-16 BOMs.
    return startsWith(b, [0xff, 0xfe]) || startsWith(b, [0xfe, 0xff]);
  }
}

export function sniff(b: Uint8Array): SniffResult {
  const none = { mime: null, executable: false, text: false };
  if (b.length < 4) return { ...none, text: looksLikeText(b) };

  // Native executables / libraries
  if (startsWith(b, [0x4d, 0x5a])) return { mime: "application/x-msdownload", executable: true, text: false }; // MZ
  if (startsWith(b, [0x7f, 0x45, 0x4c, 0x46])) return { mime: "application/x-elf", executable: true, text: false };
  if (
    startsWith(b, [0xfe, 0xed, 0xfa, 0xce]) || startsWith(b, [0xfe, 0xed, 0xfa, 0xcf]) ||
    startsWith(b, [0xce, 0xfa, 0xed, 0xfe]) || startsWith(b, [0xcf, 0xfa, 0xed, 0xfe]) ||
    startsWith(b, [0xca, 0xfe, 0xba, 0xbe])
  ) return { mime: "application/x-mach-binary", executable: true, text: false };

  const tag = (mime: string) => ({ mime, executable: false, text: false });
  if (startsWith(b, [0x25, 0x50, 0x44, 0x46])) return tag("application/pdf");
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47])) return tag("image/png");
  if (startsWith(b, [0xff, 0xd8, 0xff])) return tag("image/jpeg");
  if (ascii(b, 0, 4) === "GIF8") return tag("image/gif");
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return tag("image/webp");
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WAVE") return tag("audio/wav");
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "AVI ") return tag("video/x-msvideo");
  if (ascii(b, 0, 2) === "BM" && b.length > 14) return tag("image/bmp");
  if (startsWith(b, [0x49, 0x49, 0x2a, 0x00]) || startsWith(b, [0x4d, 0x4d, 0x00, 0x2a])) return tag("image/tiff");
  if (ascii(b, 4, 8) === "ftyp") {
    const brand = ascii(b, 8, 12);
    if (brand.startsWith("M4A") || brand === "M4B ") return tag("audio/mp4");
    if (brand === "heic" || brand === "heix" || brand === "mif1") return tag("image/heic");
    if (brand === "avif") return tag("image/avif");
    if (brand === "qt  ") return tag("video/quicktime");
    return tag("video/mp4");
  }
  if (startsWith(b, [0x1a, 0x45, 0xdf, 0xa3])) return tag("video/webm"); // webm / mkv (EBML)
  if (ascii(b, 0, 3) === "ID3" || (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0)) return tag("audio/mpeg");
  if (ascii(b, 0, 4) === "OggS") return tag("audio/ogg");
  if (ascii(b, 0, 4) === "fLaC") return tag("audio/flac");
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06])) return tag("application/zip");
  if (startsWith(b, [0x1f, 0x8b])) return tag("application/gzip");
  if (b.length > 262 && ascii(b, 257, 262) === "ustar") return tag("application/x-tar");

  const text = looksLikeText(b);
  if (text) {
    const head = ascii(b, 0, 512).trimStart().toLowerCase();
    if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return { mime: "image/svg+xml", executable: false, text };
    if (head.startsWith("<!doctype html") || head.startsWith("<html")) return { mime: "text/html", executable: false, text };
    if (head.startsWith("<?xml")) return { mime: "application/xml", executable: false, text };
    return { mime: "text/plain", executable: false, text };
  }
  return none;
}

/** Types the sniffer above recognises by signature: if one of these is claimed, the bytes must agree. */
const SIGNED = new Set([
  "application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/tiff", "image/heic", "image/avif",
  "audio/wav", "audio/mpeg", "audio/ogg", "audio/flac", "audio/mp4", "video/mp4", "video/quicktime", "video/webm", "video/x-matroska",
  "video/x-msvideo", "application/zip", "application/gzip", "application/x-tar",
]);

/** Formats that are ZIP containers under the hood (Office, OpenDocument, EPUB, iWork, app packages…). */
function isZipFamily(m: string): boolean {
  return m.includes("zip") || m.includes("officedocument") || m.includes("opendocument") || m.includes("ms-word.document.macroenabled") ||
    m.includes("ms-excel.sheet.macroenabled") || m.includes("ms-powerpoint.presentation.macroenabled") || m.startsWith("application/vnd.apple.") ||
    m === "application/vnd.android.package-archive" || m === "application/java-archive" || m === "model/3mf" || m === "application/octet-stream";
}

/** Whether a declared/extension type is plausible given the sniffed content. */
export function mimeCompatible(expected: string, sniffed: SniffResult): boolean {
  if (!sniffed.mime) return !SIGNED.has(expected) && !expected.includes("officedocument") && !expected.includes("opendocument") && expected !== "application/epub+zip";
  if (sniffed.mime === expected) return true;
  if (sniffed.text) {
    // Any text-ish expected type is fine for text content (json, csv, code, md, rtf, email, calendar…).
    return expected.startsWith("text/") || expected.includes("json") || expected.includes("xml") || expected.includes("sql") || expected.includes("yaml") ||
      expected.includes("rtf") || expected === "message/rfc822" || expected === "application/postscript" || expected === "application/x-tex" ||
      expected.startsWith("model/") || expected === "application/geo+json" || expected === "application/octet-stream";
  }
  if (sniffed.mime === "application/zip" && (isZipFamily(expected) || expected === "application/x-tar")) return true;
  // Camera RAW formats (DNG, CR2, NEF, ARW) are TIFF containers; Illustrator files are PDFs.
  if (sniffed.mime === "image/tiff" && expected.startsWith("image/")) return true;
  if (sniffed.mime === "application/pdf" && (expected === "application/postscript" || expected === "application/illustrator")) return true;
  if (sniffed.mime === "video/webm" && expected === "video/x-matroska") return true;
  if (sniffed.mime === "video/mp4" && (expected === "video/quicktime" || expected.startsWith("video/") || expected === "audio/mp4")) return true;
  if (sniffed.mime === "audio/mp4" && (expected === "audio/aac" || expected === "video/mp4" || expected.startsWith("audio/"))) return true;
  if (sniffed.mime === "image/heic" && expected.startsWith("image/hei")) return true;
  if (sniffed.mime === "audio/ogg" && (expected.startsWith("audio/") || expected === "video/ogg")) return true;
  if (sniffed.mime === "audio/mpeg" && expected.startsWith("audio/")) return true;
  if (sniffed.mime === "application/gzip" && (expected.includes("gzip") || expected.includes("tar"))) return true;
  return false;
}
