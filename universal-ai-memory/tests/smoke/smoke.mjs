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
    await page.screenshot({ path: `.e2e/public${p.replace(/\//g, "_")}.png` });
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
    await page.screenshot({ path: `.e2e/${p.replace(/[^a-z0-9]+/gi, "_") || "home"}.png` });
  }

  // A few interactions that should never throw.
  where = "interactions";
  await page.goto(`http://127.0.0.1:${APP}/settings?tab=appearance`, { waitUntil: "networkidle" });
  await page.getByTestId("theme-midnight").click();
  if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== "midnight") problems.push("[appearance] theme did not change live");
  await page.getByTestId("theme-custom").click();
  await page.getByText("Custom theme").first().waitFor({ timeout: 5000 }).catch(() => problems.push("[appearance] custom editor missing"));
  await page.goto(`http://127.0.0.1:${APP}/`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /add to memory/i }).first().click();
  await page.getByRole("dialog").waitFor({ timeout: 5000 }).catch(() => problems.push("[add dialog] did not open"));
  await page.keyboard.press("Escape");

  // Mobile layout: no horizontal scroll on the main pages.
  const mobile = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const m = await mobile.newPage();
  await mobile.addCookies(await ctx.cookies());
  for (const p of ["/", "/files", "/settings?tab=appearance", "/ask"]) {
    where = `mobile ${p}`;
    await m.goto(`http://127.0.0.1:${APP}${p}`, { waitUntil: "networkidle" });
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
