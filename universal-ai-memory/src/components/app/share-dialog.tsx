"use client";
import { useState } from "react";
import { Clock, ShieldAlert, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldError, Hint, Input, Label, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, Select, Switch } from "@/components/ui/overlay";
import { Badge, Skeleton } from "@/components/ui/misc";
import { api, errorMessage, useFetch } from "@/lib/client/api";
import { formatDate } from "@/lib/utils";

interface ShareRow { id: string; status: string; canDownload: boolean; expiresAt: string | null; createdAt: string; otherParty: { username: string } | null }

/** Private, explicit sharing with another account: recipient must accept, access expires, and the owner can revoke. */
export function ShareDialog({ fileId, fileName, open, onOpenChange }: { fileId: string; fileName: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const shares = useFetch<{ shares: ShareRow[] }>(open ? `/api/shares?direction=sent&fileId=${fileId}` : null);
  const [username, setUsername] = useState("");
  const [days, setDays] = useState("7");
  const [canDownload, setCanDownload] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true); setError(null);
    try {
      await api("/api/shares", { body: { fileId, username: username.replace(/^@/, "").trim(), canDownload, expiresInDays: Number(days), note: note.trim() || undefined } });
      toast.success("Invitation sent", { description: "They'll get access once they accept." });
      setUsername(""); setNote("");
      void shares.reload();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  async function revoke(id: string) {
    try { await api(`/api/shares/${id}`, { method: "DELETE" }); toast.success("Access revoked"); void shares.reload(); } catch (e) { toast.error(errorMessage(e)); }
  }
  const active = shares.data?.shares.filter((s) => ["pending", "accepted"].includes(s.status)) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Share privately" description={fileName}>
        <form onSubmit={(e) => { e.preventDefault(); void create(); }} className="space-y-4">
          <div>
            <Label htmlFor="share-user">Their username</Label>
            <Input id="share-user" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" autoCapitalize="none" spellCheck={false} aria-invalid={!!error} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="share-days">Access expires after</Label><Select id="share-days" value={days} onValueChange={setDays} options={[{ value: "1", label: "1 day" }, { value: "7", label: "7 days" }, { value: "30", label: "30 days" }, { value: "90", label: "90 days" }]} /></div>
            <label className="flex items-end justify-between gap-3 pb-2 text-sm"><span>Allow download</span><Switch checked={canDownload} onCheckedChange={setCanDownload} aria-label="Allow download" /></label>
          </div>
          <div><Label htmlFor="share-note">Message <span className="font-normal text-muted">(optional)</span></Label><Textarea id="share-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="min-h-16" /></div>
          <FieldError>{error}</FieldError>
          <Hint>They must accept before they can see it. You can revoke access any time. Revoking stops access here; it can't take back a copy someone already downloaded.</Hint>
          <Button type="submit" loading={busy} disabled={!username.trim()}>Send invitation</Button>
        </form>
        <div className="border-t hairline pt-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-medium"><ShieldAlert className="h-4 w-4 text-accent" aria-hidden />Who has access</h3>
          {shares.loading ? <Skeleton className="h-10" /> : active.length === 0 ? <p className="text-sm text-muted">Only you.</p> : (
            <ul className="space-y-2">
              {active.map((s) => (
                <li key={s.id} className="panel flex items-center gap-3 p-3 text-sm">
                  <User className="h-4 w-4 text-muted" aria-hidden />
                  <div className="min-w-0 flex-1"><p className="truncate font-medium">@{s.otherParty?.username ?? "unknown"}</p><p className="flex items-center gap-1 text-xs text-muted"><Clock className="h-3 w-3" aria-hidden />{s.expiresAt ? `until ${formatDate(s.expiresAt)}` : "no expiry"}{s.canDownload ? " · can download" : " · view only"}</p></div>
                  <Badge tone={s.status === "accepted" ? "ok" : "warn"}>{s.status === "accepted" ? "Accepted" : "Waiting"}</Badge>
                  <Button size="icon-sm" variant="danger-ghost" aria-label={`Revoke access for ${s.otherParty?.username}`} onClick={() => void revoke(s.id)}><Trash2 className="h-4 w-4" /></Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
