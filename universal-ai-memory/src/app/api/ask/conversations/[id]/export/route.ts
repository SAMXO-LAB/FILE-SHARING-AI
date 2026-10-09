import { must, route } from "@/lib/api";
import type { Citation } from "@/lib/retrieval/types";
import { idParams } from "@/lib/validation";

/** Markdown transcript of an Ask AI chat, including the sources each answer cited. */
export const GET = route<undefined, undefined, { id: string }>({ rateLimit: { name: "chat-export", max: 30, windowSeconds: 600 } }, async ({ supabase, user, params }) => {
  const { id } = idParams.parse(params);
  const { data: conv } = await supabase.from("ai_conversations").select("title,created_at").eq("id", id).eq("owner_id", user.id).maybeSingle();
  const conversation = must(conv);
  const { data: messages } = await supabase
    .from("ai_messages").select("role,content,structured,created_at,attachments").eq("conversation_id", id).eq("owner_id", user.id).order("created_at").limit(1000);
  const out = [`# ${conversation.title}`, "", `_Exported ${new Date().toISOString().slice(0, 10)}_`, ""];
  for (const m of messages ?? []) {
    out.push(m.role === "user" ? "## You" : "## Memory AI", "", String(m.content), "");
    const atts = (m.attachments as { name: string }[] | null) ?? [];
    if (atts.length) out.push(`Attached: ${atts.map((a) => a.name).join(", ")}`, "");
    const cites = ((m.structured as { citations?: Citation[] } | null)?.citations ?? []);
    if (cites.length) {
      out.push("Sources:");
      for (const c of cites) {
        const where = [c.page ? `p. ${c.page}` : null, c.conversationTitle, c.timestamp ? c.timestamp.slice(0, 10) : null].filter(Boolean).join(", ");
        out.push(`- [${c.n}] ${c.title}${where ? ` (${where})` : ""}`);
      }
      out.push("");
    }
  }
  const safe = conversation.title.replace(/[^\w.-]+/g, "_").slice(0, 60) || "chat";
  return new Response(out.join("\n"), {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${safe}.md"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
});
