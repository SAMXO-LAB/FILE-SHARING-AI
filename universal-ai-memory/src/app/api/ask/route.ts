import { z } from "zod";
import { errors, route } from "@/lib/api";
import { loadPolicy } from "@/lib/ai/policy";
import { ask } from "@/lib/retrieval/answer";
import { previousTurnFrom } from "@/lib/retrieval/evidence";
import { audit } from "@/lib/server/context";
import { filtersSchema } from "@/lib/validation";

export const maxDuration = 60;

const body = z.object({
  conversationId: z.uuid().optional(),
  question: z.string().trim().min(1, "Type a question first").max(4000),
  attachmentFileIds: z.array(z.uuid()).max(4).optional(),
  filters: filtersSchema.optional(),
  tzOffsetMinutes: z.number().int().min(-840).max(840).optional(),
});

export const POST = route({ body, rateLimit: { name: "ask", max: 40, windowSeconds: 600 } }, async ({ body, supabase, user }) => {
  const policy = await loadPolicy(supabase, user.id);

  let conversationId = body.conversationId;
  let previous = null as ReturnType<typeof previousTurnFrom>;
  if (conversationId) {
    const { data: conv } = await supabase.from("ai_conversations").select("id").eq("id", conversationId).eq("owner_id", user.id).maybeSingle();
    if (!conv) throw errors.notFound("That chat no longer exists.");
    const { data: last } = await supabase
      .from("ai_messages").select("structured").eq("conversation_id", conversationId).eq("owner_id", user.id).eq("role", "assistant")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    previous = previousTurnFrom(last?.structured);
  } else {
    const title = body.question.replace(/\s+/g, " ").slice(0, 80);
    const { data: created, error } = await supabase
      .from("ai_conversations").insert({ owner_id: user.id, title, filters: body.filters ?? {} }).select("id").single();
    if (error) throw error;
    conversationId = created.id as string;
  }

  // Attachments must be the caller's own files (RLS also enforces this inside ask()).
  let attachments: { id: string; name: string }[] = [];
  if (body.attachmentFileIds?.length) {
    const { data: files } = await supabase.from("files").select("id,display_name").eq("owner_id", user.id).in("id", body.attachmentFileIds);
    attachments = (files ?? []).map((f) => ({ id: f.id as string, name: f.display_name as string }));
    if (attachments.length !== new Set(body.attachmentFileIds).size) throw errors.badRequest("One of the attached files couldn't be found.");
  }

  const { data: userMsg, error: umErr } = await supabase
    .from("ai_messages").insert({ conversation_id: conversationId, owner_id: user.id, role: "user", content: body.question, attachments }).select("id,created_at").single();
  if (umErr) throw umErr;

  const result = await ask(supabase, {
    question: body.question,
    policy,
    previous,
    attachmentFileIds: attachments.map((a) => a.id),
    filters: body.filters,
    tzOffsetMinutes: body.tzOffsetMinutes,
  });

  // History keeps identifiers and the passages that were cited; cards are re-resolved (and re-authorised) on every view.
  const structured = {
    mode: result.mode,
    citations: result.citations,
    cardRefs: result.cards.map((c) => ({ type: c.type, id: c.id, title: c.title, mime: c.mime, category: c.category })),
    sections: result.sections,
    suggestedActions: result.suggestedActions,
    limitations: result.limitations,
    interpretation: result.interpretation,
    focus: result.focus,
    searchedTerms: result.searchedTerms,
    semantic: result.semantic,
  };
  const { data: aiMsg, error: amErr } = await supabase
    .from("ai_messages").insert({ conversation_id: conversationId, owner_id: user.id, role: "assistant", content: result.answer, structured }).select("id,created_at").single();
  if (amErr) throw amErr;

  await supabase.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId).eq("owner_id", user.id);
  if (policy.saveHistory) {
    await supabase.from("search_history").insert({ owner_id: user.id, query: body.question.slice(0, 2000), filters: body.filters ?? {}, result_count: result.cards.length });
  }
  if (result.mode === "ai" || result.mode === "general") await audit(user.id, "ai.answer_generated", { type: "ai_conversation", id: conversationId }, { mode: result.mode });

  return {
    conversationId,
    userMessage: { id: userMsg.id, role: "user", content: body.question, attachments, created_at: userMsg.created_at },
    assistantMessage: { id: aiMsg.id, role: "assistant", content: result.answer, structured, created_at: aiMsg.created_at },
    cards: result.cards,
  };
});
