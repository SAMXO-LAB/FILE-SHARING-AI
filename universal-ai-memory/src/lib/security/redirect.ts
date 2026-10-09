/** Only same-site relative paths are allowed as post-login destinations (prevents open redirects). */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\u0000-\u001f]/.test(next)) return "/";
  return next;
}
