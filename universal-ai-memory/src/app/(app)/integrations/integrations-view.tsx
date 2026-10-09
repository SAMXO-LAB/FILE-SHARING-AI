"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, Bot, CheckCircle2, Copy, ExternalLink, FileUp, Loader2, MessageCircle, Send, Trash2, Unplug } from "lucide-react";
import { toast } from "sonner";
import { ImportWizard } from "@/components/app/import-wizard";
import { Button } from "@/components/ui/button";
import { useDialogs } from "@/components/ui/confirm";
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui/misc";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { api, errorMessage, useFetch } from "@/lib/client/api";
import { formatDateTime, timeAgo } from "@/lib/utils";

interface Connection {
  id: string; source_id: string; kind: "whatsapp_export" | "telegram_bot" | "telegram_export" | "telegram_client";
  status: "pending" | "connected" | "disconnected" | "error"; display_name: string | null; last_synced_at: string | null; last_error: string | null;
  conversationCount: number; messageCount: number; lastImport: { status: string; at: string; error: string | null } | null;
}
interface IntegrationsData {
  connections: Connection[];
  available: { whatsapp: { automaticSync: boolean }; telegramBot: { configured: boolean; botUsername: string | null }; telegramExport: unknown; telegramClient: { available: boolean } };
}
interface Batch {
  id: string; kind: "whatsapp_export" | "telegram_export" | "telegram_bot"; status: "pending" | "processing" | "completed" | "completed_with_warnings" | "failed";
  display_name: string | null; stats: Record<string, number>; warnings: string[]; error: string | null; created_at: string; completed_at: string | null;
}
interface LinkCode { code: string; expiresAt: string; botUsername: string | null; deepLink: string | null }

const KIND_LABEL: Record<string, string> = { whatsapp_export: "WhatsApp export", telegram_export: "Telegram export", telegram_bot: "Telegram bot", telegram_client: "Telegram account" };
const STATUS_TONE = { completed: "ok", completed_with_warnings: "warn", failed: "danger", processing: "accent", pending: "neutral" } as const;
const STATUS_LABEL = { completed: "Imported", completed_with_warnings: "Imported with notes", failed: "Failed", processing: "Importing…", pending: "Waiting…" } as const;

export function IntegrationsView() {
  const { confirm } = useDialogs();
  const data = useFetch<IntegrationsData>("/api/integrations");
  const batches = useFetch<{ batches: Batch[] }>("/api/imports");
  const reloadData = data.reload;
  const reloadBatches = batches.reload;
  const [wizard, setWizard] = useState<"whatsapp_export" | "telegram_export" | null>(null);
  const [link, setLink] = useState<LinkCode | null>(null);
  const [linking, setLinking] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const h = () => { void reloadData(); void reloadBatches(); };
    window.addEventListener("memory:imports-changed", h);
    return () => window.removeEventListener("memory:imports-changed", h);
  }, [reloadData, reloadBatches]);

  const busy = batches.data?.batches.some((b) => b.status === "pending" || b.status === "processing");
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => { void reloadBatches(); void reloadData(); }, 3000);
    return () => clearInterval(t);
  }, [busy, reloadBatches, reloadData]);
  // While a link code is showing, poll so the card flips to "connected" once the bot receives it.
  useEffect(() => {
    if (!link) return;
    const t = setInterval(() => void reloadData(), 4000);
    return () => clearInterval(t);
  }, [link, reloadData]);
  const botConnected = data.data?.connections.some((c) => c.kind === "telegram_bot" && c.status === "connected");
  useEffect(() => { if (botConnected && link) { setLink(null); toast.success("Telegram is linked"); } }, [botConnected, link]);

  async function createLink() {
    setLinking(true);
    try { setLink(await api<LinkCode>("/api/integrations/telegram/link", { body: {} })); } catch (e) { toast.error(errorMessage(e)); } finally { setLinking(false); }
  }
  async function disconnect(c: Connection) {
    const deleteData = await confirmChoice(c);
    if (deleteData === null) return;
    try {
      const r = await api<{ deleted: { conversations: number; files: number } }>(`/api/integrations/${c.id}?deleteData=${deleteData ? 1 : 0}`, { method: "DELETE" });
      toast.success(deleteData ? `Disconnected and deleted ${r.deleted.conversations} chat${r.deleted.conversations === 1 ? "" : "s"}` : "Disconnected. Imported data was kept.");
      void reloadData(); void reloadBatches();
    } catch (e) { toast.error(errorMessage(e)); }
  }
  // Two explicit choices instead of a single yes/no, so deleting data is never the default.
  async function confirmChoice(c: Connection): Promise<boolean | null> {
    const keep = await confirm({
      title: `Disconnect ${c.display_name ?? KIND_LABEL[c.kind]}?`,
      description: `Nothing new will be saved from it. The ${c.conversationCount} chat${c.conversationCount === 1 ? "" : "s"} already imported stay in your memory unless you delete them next.`,
      confirmLabel: "Disconnect and keep data",
    });
    if (!keep) return null;
    if (c.conversationCount === 0) return false;
    const wipe = await confirm({
      title: "Also delete the imported data?",
      description: `This permanently deletes ${c.conversationCount} chat${c.conversationCount === 1 ? "" : "s"} (${c.messageCount} messages) and their attachments from your memory. It can't be undone.`,
      confirmLabel: "Delete imported data too",
      danger: true,
    });
    return wipe ? true : false;
  }
  async function removeBatch(b: Batch) {
    if (!(await confirm({ title: "Remove this import from history?", description: "Your messages stay where they are. Use “Delete imported data” to remove the messages as well.", confirmLabel: "Remove from history" }))) return;
    try { await api(`/api/imports/${b.id}`, { method: "DELETE" }); void reloadBatches(); } catch (e) { toast.error(errorMessage(e)); }
  }
  async function removeBatchData(b: Batch) {
    if (!(await confirm({ title: "Delete the data from this import?", description: "The messages and attachments added by this import are permanently deleted. Messages from other imports of the same chat are kept.", confirmLabel: "Delete imported data", danger: true }))) return;
    try {
      const r = await api<{ removedMessages: number }>(`/api/imports/${b.id}?deleteData=1`, { method: "DELETE" });
      toast.success(`Deleted ${r.removedMessages} message${r.removedMessages === 1 ? "" : "s"}`);
      void reloadBatches(); void reloadData();
    } catch (e) { toast.error(errorMessage(e)); }
  }

  const av = data.data?.available;
  const conns = (data.data?.connections ?? []).filter((c) => c.kind !== "telegram_client");
  const bots = conns.filter((c) => c.kind === "telegram_bot");

  return (
    <div>
      <PageHeader title="Connected Apps" description="Bring chats into your memory. Everything here is explicit: you export a chat or link a bot, and you can disconnect and delete what was imported at any time." />
      {data.error ? <ErrorState message={data.error} onRetry={data.reload} /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="glass flex flex-col gap-3 p-5" aria-labelledby="wa-h">
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400"><MessageCircle className="h-5 w-5" aria-hidden /></span><h2 id="wa-h" className="flex-1 font-semibold">WhatsApp</h2><Badge>Import only</Badge></div>
            <p className="text-sm text-muted">Export a chat from WhatsApp and upload it here to search and ask about it. WhatsApp doesn't offer a way for apps like this to read your chats automatically, so there is no live sync, and nothing is read from your phone.</p>
            <div className="mt-auto"><Button onClick={() => setWizard("whatsapp_export")}><FileUp className="h-4 w-4" aria-hidden />Import a WhatsApp export</Button></div>
          </section>

          <section className="glass flex flex-col gap-3 p-5" aria-labelledby="tg-h">
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-500/15 text-sky-400"><Send className="h-5 w-5" aria-hidden /></span><h2 id="tg-h" className="flex-1 font-semibold">Telegram</h2><Badge tone={av?.telegramBot.configured ? "ok" : "neutral"}>{av?.telegramBot.configured ? "Bot available" : "Bot not set up"}</Badge></div>
            <p className="text-sm text-muted">Import a Telegram Desktop export (JSON), or link the bot and send it messages, files and links to save. The bot only sees what you send to it; it can't read your other chats.</p>
            <div className="mt-auto flex flex-wrap gap-2">
              <Button variant="glass" onClick={() => setWizard("telegram_export")}><FileUp className="h-4 w-4" aria-hidden />Import an export</Button>
              <Button disabled={!av?.telegramBot.configured || linking} loading={linking} onClick={() => void createLink()}><Bot className="h-4 w-4" aria-hidden />{bots.length ? "Link another chat" : "Link the Telegram bot"}</Button>
            </div>
            {av && !av.telegramBot.configured && <p className="text-xs text-muted">The server owner needs to add a Telegram bot token to enable this. See docs/INTEGRATIONS.md.</p>}
            {link && (
              <div className="rounded-xl border border-accent/40 bg-accent/5 p-3 text-sm" role="status">
                <p className="font-medium">Finish linking in Telegram</p>
                {link.deepLink ? <p className="mt-1 text-muted">Open <a className="inline-flex items-center gap-1 underline" href={link.deepLink} target="_blank" rel="noopener noreferrer">@{link.botUsername}<ExternalLink className="h-3 w-3" aria-hidden /></a> and press Start.</p> : <p className="mt-1 text-muted">Send this message to the bot:</p>}
                <p className="mt-2 flex items-center gap-2"><code className="rounded bg-[rgb(var(--line)/0.15)] px-2 py-1 font-mono">/start {link.code}</code><Button size="icon-sm" variant="ghost" aria-label="Copy the link message" onClick={() => { void navigator.clipboard?.writeText(`/start ${link.code}`).then(() => toast.success("Copied")); }}><Copy className="h-4 w-4" /></Button></p>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted"><Loader2 className="h-3 w-3 animate-spin" aria-hidden />Waiting for the bot… the code works once and expires at {new Date(link.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.</p>
              </div>
            )}
          </section>
        </div>
      )}

      <h2 className="mb-3 mt-8 text-lg font-semibold">Your connections</h2>
      {data.loading ? <Skeleton className="h-24" /> : conns.length === 0 ? (
        <EmptyState icon={Unplug} title="Nothing connected yet">Imports show up here with their status and what they added. Telegram bot links appear here too.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {conns.map((c) => (
            <li key={c.id} className="glass flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{c.display_name ?? KIND_LABEL[c.kind]} <span className="font-normal text-muted">· {KIND_LABEL[c.kind]}</span></p>
                <p className="text-xs text-muted">{c.conversationCount} chat{c.conversationCount === 1 ? "" : "s"} · {c.messageCount} message{c.messageCount === 1 ? "" : "s"}{c.last_synced_at ? ` · last data ${timeAgo(c.last_synced_at)}` : ""}</p>
                {c.last_error && <p className="mt-1 flex items-center gap-1 text-xs text-danger"><AlertTriangle className="h-3.5 w-3.5" aria-hidden />{c.last_error}</p>}
              </div>
              <Badge tone={c.status === "connected" ? "ok" : c.status === "error" ? "danger" : "neutral"}>{c.status === "connected" ? <><CheckCircle2 className="h-3 w-3" aria-hidden />Connected</> : c.status}</Badge>
              <Button size="sm" variant="danger-ghost" onClick={() => void disconnect(c)}><Trash2 className="h-4 w-4" aria-hidden />Disconnect</Button>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-3 mt-8 text-lg font-semibold">Import history</h2>
      {batches.loading ? <Skeleton className="h-20" /> : batches.error ? <ErrorState message={batches.error} onRetry={batches.reload} /> : (batches.data?.batches.length ?? 0) === 0 ? (
        <p className="text-sm text-muted">No imports yet.</p>
      ) : (
        <ul className="space-y-3">
          {batches.data!.batches.map((b) => {
            const expanded = open === b.id;
            const notes = [...b.warnings, ...(b.error ? [b.error] : [])];
            return (
              <li key={b.id} className="glass p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{b.display_name ?? KIND_LABEL[b.kind]}</p>
                    <p className="text-xs text-muted">{KIND_LABEL[b.kind]} · {formatDateTime(b.created_at)}{b.stats.inserted != null ? ` · ${b.stats.inserted} new message${b.stats.inserted === 1 ? "" : "s"}${b.stats.duplicates ? `, ${b.stats.duplicates} already there` : ""}` : ""}</p>
                  </div>
                  <Badge tone={STATUS_TONE[b.status]}>{b.status === "processing" && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}{STATUS_LABEL[b.status]}</Badge>
                  {notes.length > 0 && <Button size="sm" variant="ghost" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : b.id)}>{notes.length} note{notes.length === 1 ? "" : "s"}</Button>}
                </div>
                {expanded && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
                {(b.status === "completed" || b.status === "completed_with_warnings" || b.status === "failed") && (
                  <div className="mt-3 flex flex-wrap gap-1 border-t hairline pt-2">
                    <Button size="sm" variant="ghost" onClick={() => void removeBatch(b)}>Remove from history</Button>
                    {b.status !== "failed" && <Button size="sm" variant="danger-ghost" onClick={() => void removeBatchData(b)}><Trash2 className="h-4 w-4" aria-hidden />Delete imported data</Button>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-8 rounded-xl border hairline p-4 text-sm text-muted">
        <p className="font-medium text-fg">What isn't supported</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>Automatic WhatsApp sync. WhatsApp offers no such access to apps like this; imports are manual exports.</li>
          <li>Reading your personal Telegram account (client API). The bot and exports are the supported routes for now.</li>
          <li>Telegram HTML exports (use JSON), and opening a message directly inside WhatsApp or Telegram. Results link to the copy saved here.</li>
        </ul>
      </div>

      <Dialog open={wizard !== null} onOpenChange={(o) => { if (!o) setWizard(null); }}>
        <DialogContent title="Import a chat export" description="Your file is used to import the messages, then deleted.">
          {wizard && <ImportWizard initialKind={wizard} onDone={() => { setWizard(null); void reloadData(); void reloadBatches(); }} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
