import { errors, must, route } from "@/lib/api";
import { audit, indexNoteLater } from "@/lib/server/context";
import type { Citation } from "@/lib/retrieval/types";
import { idParams } from "@/lib/validation";

/** Saves an AI answer (and the titles of the sources it cited) as a note, labelled as AI-generated. */
export const POST = route<undefined, undefined, { id: string }>({ rateLimit: { name: "save-answer-note", max: 60, windowSeconds: 600 } }, async ({ supabase, user, params }) => {
  const { id } = idParams.parse(params);
  const { data } = await supabase.from("ai_messages").select("role,content,structured,conversation_id,created_at").eq("id", id).eq("owner_id", user.id).maybeSingle();
  const msg = must(data);
  if (msg.role !== "assistant") throw errors.badRequest("Only answers can be saved as notes.");
  const { data: q } = await supabase
    .from("ai_messages").select("content").eq("conversation_id", msg.conversation_id).eq("owner_id", user.id).eq("role", "user").lt("created_at", msg.created_at)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const cites = ((msg.structured as { citations?: Citation[] } | null)?.citations ?? []);
  const lines = [String(msg.content), ""];
  if (cites.length) {
    lines.push("Sources:");
    for (const c of cites) lines.push(`- [${c.n}] ${c.title}${c.page ? ` (p. ${c.page})` : ""}`);
    lines.push("");
  }
  lines.push("_Saved from an AI-generated answer. Check the sources before relying on it._");
  const title = (q?.content ? String(q.content) : "AI answer").replace(/\s+/g, " ").slice(0, 80);
  const { data: note, error } = await supabase
    .from("notes").insert({ owner_id: user.id, title, body: lines.join("\n"), origin: "ai_answer" }).select("*").single();
  if (error) throw error;
  await audit(user.id, "note.created", { type: "note", id: note.id }, { origin: "ai_answer" });
  indexNoteLater(note.id);
  return { note };
});
