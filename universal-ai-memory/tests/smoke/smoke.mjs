// Browser smoke test: signs in against the mock backend and opens every page in headless Chromium.
// Fails on uncaught page errors, console errors, CSP violations or server errors. Not a substitute
// for the DB tests; see docs/TESTING.md. Run:  npm run build && npm run test:smoke
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require("/opt/npm-tools/node_modules/playwright")); }

const MOCK = 54399, APP = 3111;
const MODE = process.env.MOCK_COLOR_MODE ?? "light";
const SHOT = (name) => `.e2e/${MODE}${name}.png`;
const env = { ...process.env, MOCK_PORT: String(MOCK), PORT: String(APP), NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${MOCK}`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "smoke-key", SUPABASE_SECRET_KEY: "smoke-secret", NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${APP}`, CRON_SECRET: "smoke" };
const procs = [spawn("node", ["tests/smoke/mock-supabase.mjs"], { env, stdio: "inherit", detached: true }), spawn("npx", ["next", "start", "-p", String(APP)], { env, stdio: ["ignore", "pipe", "pipe"], detached: true })];
const appLog = [];
procs[1].stdout.on("data", (d) => appLog.push(String(d)));
procs[1].stderr.on("data", (d) => appLog.push(String(d)));
// `next start` forks a server process, so stop the whole process group.
const stop = () => procs.forEach((p) => { try { process.kill(-p.pid, "SIGTERM"); } catch {} });
process.on("exit", stop);

async function waitFor(url) {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(url, { redirect: "manual" }); if (r.status < 500) return; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  throw new Error(`${url} did not start.\n${appLog.join("")}`);
}

const PUBLIC = ["/login", "/signup", "/forgot-password"];
const PAGES = ["/", "/ask", "/memory", "/memory?q=test", "/files", "/documents", "/media", "/links", "/conversations", "/collections", "/integrations", "/uploads",
  "/settings?tab=account", "/settings?tab=appearance", "/settings?tab=privacy", "/settings?tab=storage", "/settings?tab=ai", "/settings?tab=notifications"];

const problems = [];
try {
  await waitFor(`http://127.0.0.1:${APP}/login`);
  const browser = await chromium.launch();
  mkdirSync(".e2e", { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  let where = "";
  page.on("pageerror", (e) => problems.push(`[${where}] uncaught: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) problems.push(`[${where}] console: ${m.text().slice(0, 300)}`); });
  page.on("response", (r) => { if (r.status() >= 500) problems.push(`[${where}] ${r.status()} ${r.url()}`); });

  for (const p of PUBLIC) {
    where = p;
    await page.goto(`http://127.0.0.1:${APP}${p}`, { waitUntil: "networkidle" });
    if (!(await page.locator("h1, h2").first().isVisible())) problems.push(`[${p}] no heading`);
  }

  where = "google button";
  for (const p of ["/login", "/signup"]) {
    await page.goto(`http://127.0.0.1:${APP}${p}`, { waitUntil: "networkidle" });
    if (!(await page.getByRole("button", { name: /with google/i }).isVisible())) problems.push(`[${p}] Google button missing`);
    await page.screenshot({ path: SHOT(`_public${p.replace(/\//g, "_")}`) });
  }

  where = "sign-in";
  await page.goto(`http://127.0.0.1:${APP}/login`, { waitUntil: "networkidle" });
  await page.getByLabel(/email/i).fill("smoke@example.test");
  await page.getByLabel(/password/i).first().fill("correct horse 1");
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 }).catch(() => problems.push("[sign-in] did not leave /login"));

  for (const p of PAGES) {
    where = p;
    const resp = await page.goto(`http://127.0.0.1:${APP}${p}`, { waitUntil: "networkidle" });
    if (!resp || resp.status() >= 400) problems.push(`[${p}] HTTP ${resp?.status()}`);
    if (new URL(page.url()).pathname === "/login") { problems.push(`[${p}] redirected to /login`); continue; }
    await page.locator("main h1, main h2").first().waitFor({ timeout: 8000 }).catch(() => problems.push(`[${p}] no heading rendered`));
    await page.screenshot({ path: SHOT(p.replace(/[^a-z0-9]+/gi, "_") || "home") });
  }

  // A few interactions that should never throw.
  where = "interactions";
  await page.goto(`http://127.0.0.1:${APP}/settings?tab=appearance`, { waitUntil: "networkidle" });
  await page.getByTestId("theme-midnight").click();
  if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== "midnight") problems.push("[appearance] theme did not change live");
  await page.getByTestId("theme-custom").click();
  await page.getByText("Custom theme").first().waitFor({ timeout: 5000 }).catch(() => problems.push("[appearance] custom editor missing"));
  await page.getByTestId("theme-liquid-glass").click();
  await page.waitForTimeout(300);
  await page.goto(`http://127.0.0.1:${APP}/`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /add to memory/i }).first().click();
  await page.getByRole("dialog").waitFor({ timeout: 5000 }).catch(() => problems.push("[add dialog] did not open"));
  await page.keyboard.press("Escape");

  // Ask AI with a TEST-ONLY response fixture (intercepted in the browser; the app never shows sample data).
  where = "ask fixture";
  const card = (n, extra = {}) => ({ key: `file:f${n}`, type: "file", id: `0000000${n}-0000-4000-8000-000000000000`, section: "files", title: `Quarterly report ${n}.pdf`, typeLabel: "PDF", mime: "application/pdf", category: "document", sourceId: "upload", sourceLabel: "Uploaded", sender: null, senderVerified: false, date: "2026-10-09T10:00:00Z", dateKind: "uploaded", sizeBytes: 302000, status: "ready", statusDetail: null, description: null, url: null, conversationTitle: null, messageCount: null, relevance: 1, relevanceLabel: n === 1 ? "high" : "medium", passages: [{ recordId: `r${n}`, text: "Revenue grew 12% quarter over quarter, driven by the new subscription tier and lower churn in the enterprise segment.", page: 2, pageEnd: null, seqFrom: null, seqTo: null, matchedBy: ["text"] }], ...extra });
  const cards = [1, 2, 3, 4, 5, 6, 7].map((n) => card(n));
  const long = "Revenue grew 12% quarter over quarter, driven by the new subscription tier and lower churn in the enterprise segment. ".repeat(4);
  await page.route("**/api/ask", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    conversationId: "c0000000-0000-4000-8000-000000000000",
    userMessage: { id: "u1", content: "what grew last quarter?", attachments: [] },
    assistantMessage: { id: "a1", content: "I found 7 items in your memory about “revenue”.\n\nBest match: “Quarterly report 1.pdf” (PDF, page 2) [1]\n\nAlso: “Quarterly report 2.pdf” [2]", structured: { mode: "extractive", citations: [1, 2].map((n) => ({ n, cardKey: `file:f${n}`, recordId: `r${n}`, kind: "chunk", title: `Quarterly report ${n}.pdf`, sourceLabel: "Uploaded", page: 2, pageEnd: null, seqFrom: null, seqTo: null, conversationTitle: null, timestamp: null, passage: n === 1 ? long : "Short excerpt.", href: "/files" })), sections: [{ key: "files", label: "Related files", cardKeys: cards.map((c) => c.key) }], suggestedActions: [{ id: "s", label: "Summarize these", kind: "prompt", prompt: "Summarize these" }], limitations: ["Written answers are unavailable because no AI provider is configured on this server, so you're seeing matching passages instead."], interpretation: { chips: [{ kind: "date", label: "last quarter" }], intent: "find" }, semantic: false } },
    cards,
  }) }));
  await page.route("**/api/ask/conversations?*", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ conversations: [] }) }));
  await page.goto(`http://127.0.0.1:${APP}/ask`, { waitUntil: "networkidle" });
  await page.getByLabel("Your question").fill("what grew last quarter?");
  await page.keyboard.press("Enter");
  await page.getByText("Best match").first().waitFor({ timeout: 8000 }).catch(() => problems.push("[ask] answer did not render"));
  await page.getByRole("button", { name: "Show more" }).first().click().catch(() => problems.push("[ask] source expand missing"));
  if (!(await page.getByRole("button", { name: /View all 7/ }).isVisible())) problems.push("[ask] 'View all' missing for long sections");
  // With a provider configured but privacy mode on "Text extraction", the answer offers an explicit opt-in.
  if (process.env.GEMINI_API_KEY && !(await page.getByRole("button", { name: "Allow AI answers" }).isVisible())) problems.push("[ask] 'Allow AI answers' missing");
  await page.screenshot({ path: SHOT("_ask_answer"), fullPage: true });
  // The composer must not cover the last piece of content when scrolled to the bottom.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(200);
  const overlap = await page.evaluate(() => {
    const form = document.querySelector("form textarea")?.closest("form");
    const last = [...document.querySelectorAll("[aria-label='Suggested next steps']")].pop();
    if (!form || !last) return "missing";
    const f = form.querySelector("[data-drop-attach]").getBoundingClientRect(); const l = last.getBoundingClientRect();
    return l.bottom > f.top ? `overlap ${Math.round(l.bottom - f.top)}px` : "ok";
  });
  if (overlap !== "ok") problems.push(`[ask] composer vs content: ${overlap}`);
  await page.screenshot({ path: SHOT("_ask_bottom") });
  await page.unroute("**/api/ask");

  // Mobile layout: no horizontal scroll on the main pages.
  const mobile = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const m = await mobile.newPage();
  await mobile.addCookies(await ctx.cookies());
  for (const p of ["/", "/files", "/settings?tab=appearance", "/ask", "/memory"]) {
    where = `mobile ${p}`;
    await m.goto(`http://127.0.0.1:${APP}${p}`, { waitUntil: "networkidle" });
    await m.screenshot({ path: SHOT(`_m${p.replace(/[^a-z0-9]+/gi, "_")}`) });
    const overflow = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) problems.push(`[mobile ${p}] horizontal overflow of ${overflow}px`);
  }
  await browser.close();
} catch (e) {
  problems.push(`harness: ${e.message}`);
} finally {
  stop();
}
if (problems.length) { console.error("\nSMOKE TEST FAILED:\n" + [...new Set(problems)].join("\n")); console.error("\n--- app log ---\n" + appLog.join("").slice(-2500)); process.exit(1); }
console.log("Smoke test passed: all pages rendered with no runtime errors.");
process.exit(0);
