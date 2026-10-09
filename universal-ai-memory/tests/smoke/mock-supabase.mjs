// A tiny stand-in for Supabase used ONLY by the browser smoke test (tests/smoke/smoke.mjs).
// It answers the few Auth calls needed to sign in and returns fixed profile/preferences rows;
// every other table is empty. It exists to render pages in their real empty state and catch
// runtime errors. It does NOT test RLS, storage, search or imports (those are covered by the
// Postgres tests in tests/db and the unit tests).
import http from "node:http";

const PORT = Number(process.env.MOCK_PORT ?? 54399);
const userId = "11111111-1111-4111-8111-111111111111";
const now = new Date().toISOString();
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const user = { id: userId, aud: "authenticated", role: "authenticated", email: "smoke@example.test", email_confirmed_at: now, app_metadata: {}, user_metadata: { username: "smoke" }, created_at: now };
const jwt = () => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: userId, aud: "authenticated", role: "authenticated", email: user.email, exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000), session_id: "s1" })}.sig`;
const session = () => ({ access_token: jwt(), token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "refresh", user });

const profile = { id: userId, username: "smoke", display_name: "Smoke Test", avatar_url: null, bio: null, profile_visibility: "private", username_changed_at: null, storage_quota_bytes: 5368709120, max_upload_bytes: 2147483648, created_at: now };
// Starts on the pre-redesign stored defaults (system mode, old purple accent) to check they map to the new look.
const prefs = { user_id: userId, theme: "liquid-glass", color_mode: process.env.MOCK_COLOR_MODE ?? "light", accent_color: "#7c8cff", background_style: "gradient", sidebar_style: "glass", border_radius: "lg", chat_bubble_style: "soft", animation_level: "normal", high_contrast: false, sidebar_collapsed: false, processing_mode: "extraction", semantic_indexing: true, auto_categorize: true, response_style: "balanced", search_recency_boost: true, save_search_history: true, privacy_acknowledged_at: null, notify_upload_complete: true, notify_processing_complete: true, notify_import_failures: true, notify_security_alerts: true };
const tables = { profiles: profile, user_preferences: prefs };

const log = [];
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const send = (code, body, headers = {}) => { res.writeHead(code, { "content-type": "application/json", ...headers }); res.end(body === undefined ? "" : JSON.stringify(body)); };
  let data = "";
  req.on("data", (c) => (data += c));
  req.on("end", () => {
    log.push(`${req.method} ${url.pathname}`);
    if (url.pathname === "/__log") return send(200, log);
    const p = url.pathname;
    if (p === "/auth/v1/token") return send(200, session());
    if (p === "/auth/v1/user") return send(200, user);
    if (p === "/auth/v1/settings") return send(200, { external: { email: true, google: true } });
    if (p === "/auth/v1/logout") return send(204);
    if (p.startsWith("/auth/v1/.well-known/jwks")) return send(200, { keys: [] });
    if (p.startsWith("/auth/v1/")) return send(200, {});
    if (p.startsWith("/rest/v1/rpc/")) return send(200, null);
    if (p.startsWith("/rest/v1/")) {
      const table = p.slice("/rest/v1/".length);
      const wantsObject = (req.headers.accept ?? "").includes("vnd.pgrst.object");
      const row = tables[table];
      const range = { "content-range": "*/0" };
      if (req.method !== "GET" && req.method !== "HEAD") {
        if (row && req.method === "PATCH") { try { Object.assign(row, JSON.parse(data || "{}")); } catch {} return send(200, wantsObject ? row : [row]); }
        return send(wantsObject ? 406 : 201, wantsObject ? { code: "PGRST116", message: "no rows" } : []);
      }
      if (row) return send(200, wantsObject ? row : [row], range);
      if (wantsObject) return send(406, { code: "PGRST116", details: "The result contains 0 rows", message: "JSON object requested, multiple (or no) rows returned" });
      return send(200, [], range);
    }
    if (p.startsWith("/storage/v1/")) return send(404, { message: "mock: no storage" });
    send(404, { message: "mock: not found" });
  });
});
server.listen(PORT, "127.0.0.1", () => console.log(`mock supabase on ${PORT}`));
