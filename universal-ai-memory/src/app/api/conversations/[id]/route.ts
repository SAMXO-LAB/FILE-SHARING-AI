import { z } from "zod";
import { must, route } from "@/lib/api";
import { audit } from "@/lib/server/context";
import { idParams } from "@/lib/validation";

type P = { id: string };

const query = z.object({
  /** Return messages around this sequence number (used by deep links from answers). */
  around: z.coerce.number().int().min(1).optional(),
  after: z.coerce.number().int().min(0).optional(),
  before: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(10).max(200).default(80),
});

export const GET = route<undefined, z.infer<typeof query>, P>({ query }, async ({ query, supabase, user, params }) => {
  const { id } = idParams.parse(params);
  const { data: conv } = await supabase.from("conversations").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle();
  const conversation = must(conv);

  let from = 1, to = query.limit;
  if (query.around) { from = Math.max(1, query.around - Math.floor(query.limit / 3)); to = from + query.limit - 1; }
  else if (query.after !== undefined) { from = query.after + 1; to = from + query.limit - 1; }
  else if (query.before) { to = query.before - 1; from = Math.max(1, to - query.limit + 1); }
  else { from = Math.max(1, Number(conversation.message_count) - query.limit + 1); to = Number(conversation.message_count); } // default: latest messages

  const { data: messages, error } = await supabase
    .from("messages")
    .select("id,seq,sender_label,sender_kind,sent_at,body,kind,attachment_name,attachment_file_id")
    .eq("conversation_id", id).eq("owner_id", user.id).gte("seq", from).lte("seq", to).order("seq", { ascending: true });
  if (error) throw error;
  const total = Number(conversation.message_count);
  return { conversation, messages: messages ?? [], range: { from, to }, hasEarlier: from > 1, hasLater: to < total };
});

/** Deletes the conversation, its messages and their search index. Attachment files that were imported with it stay in All Files. */
export const DELETE = route<undefined, undefined, P>({}, async ({ supabase, user, params }) => {
  const { id } = idParams.parse(params);
  const { error } = await supabase.from("conversations").delete().eq("id", id).eq("owner_id", user.id);
  if (error) throw error;
  await audit(user.id, "conversation.deleted", { type: "conversation", id });
  return { ok: true };
});
