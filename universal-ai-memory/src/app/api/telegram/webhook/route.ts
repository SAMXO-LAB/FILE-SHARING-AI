import { after, NextResponse, type NextRequest } from "next/server";
import { adminConfigured, telegramConfig } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleTelegramUpdate, verifyWebhookSecret, type TgUpdate } from "@/lib/telegram/bot";

export const maxDuration = 30;

/** Telegram → app. Authenticated by the secret token Telegram echoes back, not by a user session. */
export async function POST(req: NextRequest) {
  if (!telegramConfig() || !adminConfigured()) return NextResponse.json({ ok: false }, { status: 503 });
  if (!verifyWebhookSecret(req.headers.get("x-telegram-bot-api-secret-token"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (typeof update?.update_id !== "number") return NextResponse.json({ ok: false }, { status: 400 });
  // Acknowledge immediately; Telegram retries on slow responses. Handling is idempotent.
  after(async () => {
    try {
      await handleTelegramUpdate(createAdminClient(), update);
    } catch (e) {
      console.error("[telegram] update failed:", (e as Error).message.slice(0, 200));
    }
  });
  return NextResponse.json({ ok: true });
}
