/**
 * CSRF defence for cookie-authenticated, state-changing requests.
 * Browsers always attach Origin (or Sec-Fetch-Site) to cross-site POST/PUT/PATCH/DELETE,
 * so a mismatch is rejected. Requests with neither header are rejected too: they are not
 * browser form/fetch submissions, and cookie-authenticated APIs should not accept them.
 */
export function isSameOrigin(headers: Headers, requestUrl: string): boolean {
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? new URL(requestUrl).host).toLowerCase();
  const origin = headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host.toLowerCase() === host;
    } catch {
      return false;
    }
  }
  const site = headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";
  return false;
}
