/**
 * Points your Telegram bot at this app's webhook.
 *
 *   npm run telegram:webhook -- https://your-domain.example
 *
 * Needs TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in .env.local. Telegram only accepts HTTPS
 * URLs; for local development use a tunnel (see docs/INTEGRATIONS.md).
 */
import { loadEnv } from "./load-env";

loadEnv();
const base = (process.argv[2] ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
if (!base.startsWith("https://")) {
  console.error("Pass your public HTTPS address, e.g.  npm run telegram:webhook -- https://memory.example.com");
  process.exit(1);
}
const { telegramConfig } = await import("@/lib/env");
const { setWebhook } = await import("@/lib/telegram/bot");
if (!telegramConfig()) {
  console.error("Set TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in .env.local first.");
  process.exit(1);
}
await setWebhook(`${base}/api/telegram/webhook`);
console.log(`Webhook set to ${base}/api/telegram/webhook`);
