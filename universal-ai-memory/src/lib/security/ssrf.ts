import dns from "node:dns";
import net from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

/**
 * SSRF-safe outbound fetching for user-supplied URLs.
 *
 * Defences, in order:
 *  1. Only http(s), no embedded credentials, only ports 80/443.
 *  2. Hostname deny-list (localhost, *.local, *.internal, ...).
 *  3. The IP address is validated at CONNECT time inside a custom DNS lookup used by the socket
 *     itself, so there is no gap between "check" and "use" (defeats DNS rebinding).
 *  4. Redirects are followed manually (max 5) and every hop goes through 1-3 again.
 *  5. Hard timeout, response-size cap, content-type allow-list.
 */

const blocked = new net.BlockList();
// IPv4
for (const [net_, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(net_, prefix, "ipv4");
// IPv6
for (const [net_, prefix] of [
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["100::", 64], ["2001::", 32], ["2001:db8::", 32],
  ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
] as const) blocked.addSubnet(net_, prefix, "ipv6");

export function isBlockedAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, "").split("%")[0]!;
  const family = net.isIP(ip);
  if (family === 0) return true; // not an IP: refuse
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) must be judged by the embedded IPv4 address.
  const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return blocked.check(mapped[1]!, "ipv4");
  const mappedHex = ip.toLowerCase().match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1]!, 16), lo = parseInt(mappedHex[2]!, 16);
    return blocked.check(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`, "ipv4");
  }
  return blocked.check(ip, family === 4 ? "ipv4" : "ipv6");
}

const BLOCKED_HOST_SUFFIXES = [".local", ".localhost", ".internal", ".intranet", ".lan", ".home", ".corp", ".private"];
const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal", "metadata"]);

export class UnsafeUrlError extends Error {
  constructor(public reason: string) {
    super(reason);
  }
}

/** Static checks that need no network. Throws UnsafeUrlError. */
export function assertSafeUrlShape(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("That doesn't look like a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UnsafeUrlError("Only http and https links can be saved.");
  if (url.username || url.password) throw new UnsafeUrlError("Links with embedded credentials are not allowed.");
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  if (port !== "80" && port !== "443") throw new UnsafeUrlError("Only standard web ports (80/443) are allowed.");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) throw new UnsafeUrlError("The link has no host name.");
  if (BLOCKED_HOSTS.has(host) || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new UnsafeUrlError("That address points to a private or internal network.");
  }
  const bare = host.replace(/^\[|\]$/g, "");
  if (net.isIP(bare) && isBlockedAddress(bare)) throw new UnsafeUrlError("That address points to a private or internal network.");
  if (!net.isIP(bare) && !host.includes(".")) throw new UnsafeUrlError("The link must use a full public domain name.");
  return url;
}

type LookupCb = (err: Error | null, address: string | dns.LookupAddress[], family?: number) => void;

/** DNS lookup used by the socket. Resolves once and refuses any non-public address. */
export function guardedLookup(
  hostname: string,
  options: dns.LookupOptions,
  cb: LookupCb,
  resolver: typeof dns.lookup = dns.lookup,
) {
  resolver(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, "");
    const list = (addresses as unknown as dns.LookupAddress[]) ?? [];
    if (list.length === 0) return cb(new UnsafeUrlError("Host did not resolve."), "");
    for (const a of list) {
      if (isBlockedAddress(a.address)) {
        return cb(new UnsafeUrlError("That address points to a private or internal network."), "");
      }
    }
    if (options.all) return cb(null, list);
    const first = list[0]!;
    return cb(null, first.address, first.family);
  });
}

const agent = new Agent({
  connect: { lookup: guardedLookup as never, timeout: 8000 },
  headersTimeout: 10_000,
  bodyTimeout: 10_000,
});

export interface SafeFetchOptions {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  allowedContentTypes?: RegExp;
  /** Test seam. */
  dispatcher?: unknown;
}

export interface SafeFetchResult {
  finalUrl: string;
  status: number;
  contentType: string;
  body: Uint8Array;
  truncated: boolean;
}

const DEFAULT_TYPES = /^(text\/(html|plain)|application\/xhtml\+xml)\b/i;

export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const maxBytes = opts.maxBytes ?? 2_000_000;
  const maxRedirects = opts.maxRedirects ?? 5;
  const allowed = opts.allowedContentTypes ?? DEFAULT_TYPES;
  const deadline = Date.now() + (opts.timeoutMs ?? 15_000);

  let current = assertSafeUrlShape(rawUrl);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1, deadline - Date.now()));
    let res;
    try {
      res = await undiciFetch(current, {
        redirect: "manual",
        signal: controller.signal,
        dispatcher: (opts.dispatcher ?? agent) as never,
        headers: {
          "user-agent": "UniversalAIMemoryBot/1.0 (+link preview; user-requested)",
          accept: "text/html,text/plain;q=0.9,*/*;q=0.1",
        },
      });
    } catch (err) {
      clearTimeout(timer);
      const cause = (err as { cause?: unknown }).cause;
      if (cause instanceof UnsafeUrlError) throw cause;
      if ((err as Error).name === "AbortError") throw new UnsafeUrlError("The site took too long to respond.");
      if (err instanceof UnsafeUrlError) throw err;
      throw new UnsafeUrlError("The site could not be reached.");
    }

    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      clearTimeout(timer);
      await res.body?.cancel().catch(() => {});
      if (hop === maxRedirects) throw new UnsafeUrlError("Too many redirects.");
      current = assertSafeUrlShape(new URL(res.headers.get("location")!, current).toString());
      continue;
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (res.ok && !allowed.test(contentType)) {
      clearTimeout(timer);
      await res.body?.cancel().catch(() => {});
      throw new UnsafeUrlError(`This link points to a ${contentType.split(";")[0] || "non-web"} file, which can't be previewed. Upload the file instead.`);
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    let truncated = false;
    try {
      const reader = res.body?.getReader();
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          chunks.push(value.subarray(0, value.byteLength - (total - maxBytes)));
          truncated = true;
          await reader.cancel().catch(() => {});
          break;
        }
        chunks.push(value);
      }
    } catch (err) {
      if (err instanceof UnsafeUrlError) throw err;
      if (!truncated) throw new UnsafeUrlError("The download was interrupted.");
    } finally {
      clearTimeout(timer);
    }
    const body = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
    let off = 0;
    for (const c of chunks) {
      body.set(c, off);
      off += c.byteLength;
    }
    return { finalUrl: current.toString(), status: res.status, contentType, body, truncated };
  }
  throw new UnsafeUrlError("Too many redirects.");
}

const TRACKING = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|ref_src|_hsenc|_hsmi)$/i;

/** Canonical form used to detect duplicate saved links. */
export function normalizeUrl(raw: string): string {
  const u = new URL(raw);
  u.hash = "";
  u.hostname = u.hostname.toLowerCase();
  if ((u.protocol === "http:" && u.port === "80") || (u.protocol === "https:" && u.port === "443")) u.port = "";
  for (const key of [...u.searchParams.keys()]) if (TRACKING.test(key)) u.searchParams.delete(key);
  let s = u.toString();
  if (u.pathname === "/" && !u.search) s = s.replace(/\/$/, "");
  return s;
}
