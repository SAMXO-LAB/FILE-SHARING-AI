import { z } from "zod";
import { errors, must, route } from "@/lib/api";
import { rehydrateCards } from "@/lib/retrieval/cards";
import type { ContentCard } from "@/lib/retrieval/types";
import { idParams } from "@/lib/validation";

type P = { id: string };

export const GET = route<undefined, undefined, P>({}, async ({ supabase, user, params }) => {
  const { id } = idParams.parse(params);
  const { data: conv } = await supabase.from("ai_conversations").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle();
  const conversation = must(conv);
  const { data: messages, error } = await supabase
    .from("ai_messages").select("id,role,content,structured,attachments,created_at").eq("conversation_id", id).eq("owner_id", user.id)
    .order("created_at", { ascending: true }).limit(500);
  if (error) throw error;

  // Cards are rebuilt from live rows (through RLS): anything deleted, trashed or unshared is gone.
  const refs = new Map<string, { type: ContentCard["type"]; id: string }>();
  for (const m of messages ?? []) {
    const cardRefs = (m.structured as { cardRefs?: { type: ContentCard["type"]; id: string }[] } | null)?.cardRefs ?? [];
    for (const r of cardRefs) refs.set(`${r.type}:${r.id}`, { type: r.type, id: r.id });
  }
  const live = await rehydrateCards(supabase, [...refs.values()].slice(0, 200));
  const byKey = new Map(live.map((c) => [c.key, c]));
  return {
    conversation,
    messages: (messages ?? []).map((m) => {
      const cardRefs = (m.structured as { cardRefs?: { type: ContentCard["type"]; id: string }[] } | null)?.cardRefs ?? [];
      const cards = cardRefs.map((r) => byKey.get(`${r.type}:${r.id}`)).filter((c): c is ContentCard => Boolean(c));
      return { ...m, cards, removedCards: cardRefs.length - cards.length };
    }),
  };
});

const patch = z.object({ title: z.string().trim().min(1).max(200) });

export const PATCH = route<z.infer<typeof patch>, undefined, P>({ body: patch }, async ({ body, supabase, user, params }) => {
  const { id } = idParams.parse(params);
  const { data, error } = await supabase.from("ai_conversations").update({ title: body.title }).eq("id", id).eq("owner_id", user.id).select("id,title").maybeSingle();
  if (error) throw error;
  return { conversation: must(data) };
});

export const DELETE = route<undefined, undefined, P>({}, async ({ supabase, user, params }) => {
  const { id } = idParams.parse(params);
  const { error } = await supabase.from("ai_conversations").delete().eq("id", id).eq("owner_id", user.id);
  if (error) throw error;
  return { ok: true };
});
