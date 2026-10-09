import { errors, route } from "@/lib/api";
import { telegramConfig } from "@/lib/env";
import { generateLinkCode, hashLinkCode } from "@/lib/telegram/bot";
import { adminOrThrow, audit } from "@/lib/server/context";

/** Creates a one-time code (15 min) the user sends to the bot. Only a hash is stored. */
export const POST = route({ rateLimit: { name: "telegram-link", max: 10, windowSeconds: 3600 } }, async ({ user }) => {
  const cfg = telegramConfig();
  if (!cfg) throw errors.notConfigured("The Telegram bot isn't set up on this server. See docs/INTEGRATIONS.md.");
  const admin = adminOrThrow();
  await admin.from("telegram_link_codes").delete().eq("owner_id", user.id).is("used_at", null);
  const code = generateLinkCode();
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  const { error } = await admin.from("telegram_link_codes").insert({ owner_id: user.id, code_hash: hashLinkCode(code), expires_at: expiresAt });
  if (error) throw error;
  await audit(user.id, "integration.telegram_link_code_created", { type: "profile", id: user.id });
  return {
    code,
    expiresAt,
    botUsername: cfg.botUsername ?? null,
    deepLink: cfg.botUsername ? `https://t.me/${cfg.botUsername}?start=${code}` : null,
  };
});
