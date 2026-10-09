"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/app/app-context";
import { Button } from "@/components/ui/button";
import { FieldError, Hint, Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/overlay";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { api, errorMessage, useFetch } from "@/lib/client/api";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Skeleton } from "@/components/ui/misc";
import type { Profile } from "@/lib/types";
import { Section } from "./parts";

const COOLDOWN_DAYS = 14;

function ProfileForm() {
  const { profile, setProfile, email } = useApp();
  const [name, setName] = useState(profile.display_name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [vis, setVis] = useState(profile.profile_visibility);
  const [busy, setBusy] = useState(false);
  const dirty = name !== (profile.display_name ?? "") || bio !== (profile.bio ?? "") || vis !== profile.profile_visibility;
  async function save() {
    setBusy(true);
    try {
      const r = await api<{ profile: Profile }>("/api/profile", { method: "PATCH", body: { display_name: name.trim() || null, bio: bio.trim() || null, profile_visibility: vis } });
      setProfile(r.profile);
      toast.success("Profile saved");
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  }
  return (
    <Section title="Profile" description={<>Signed in as <strong>{email ?? "—"}</strong>. Your username is <strong>@{profile.username}</strong>.</>}>
      <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="space-y-4">
        <div><Label htmlFor="p-name">Display name</Label><Input id="p-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></div>
        <div><Label htmlFor="p-bio">Bio</Label><Textarea id="p-bio" rows={2} value={bio} maxLength={500} onChange={(e) => setBio(e.target.value)} /></div>
        <div>
          <Label htmlFor="p-vis">Who can find your profile</Label>
          <Select id="p-vis" value={vis} onValueChange={(v) => setVis(v as Profile["profile_visibility"])} options={[{ value: "private", label: "Only me" }, { value: "connections", label: "People I share with" }, { value: "public", label: "Anyone with my username" }]} />
          <Hint>Files are never visible to anyone until you share them explicitly.</Hint>
        </div>
        <Button type="submit" disabled={!dirty || busy} loading={busy}>Save profile</Button>
      </form>
    </Section>
  );
}

function UsernameForm() {
  const { profile, setProfile } = useApp();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nextAllowed = profile.username_changed_at ? new Date(new Date(profile.username_changed_at).getTime() + COOLDOWN_DAYS * 86400_000) : null;
  const [now] = useState(() => Date.now());
  const locked = nextAllowed !== null && nextAllowed.getTime() > now;
  async function submit() {
    setBusy(true); setError(null);
    try {
      const r = await api<{ username: string }>("/api/profile/username", { body: { username: value.trim() } });
      setProfile({ ...profile, username: r.username, username_changed_at: new Date().toISOString() });
      setValue("");
      toast.success(`You're now @${r.username}`);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return (
    <Section title="Username" description={`Usernames are unique and not case-sensitive. You can change yours once every ${COOLDOWN_DAYS} days; the old one becomes available to others.`}>
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-2">
        <Label htmlFor="u-new">New username</Label>
        <div className="flex gap-2">
          <Input id="u-new" value={value} maxLength={30} disabled={locked} autoComplete="off" aria-invalid={Boolean(error)} aria-describedby={error ? "u-err" : undefined} onChange={(e) => { setValue(e.target.value); setError(null); }} placeholder={profile.username} />
          <Button type="submit" disabled={locked || busy || value.trim().length < 3} loading={busy}>Change</Button>
        </div>
        {locked && nextAllowed && <Hint>You can change it again on {formatDate(nextAllowed.toISOString())}.</Hint>}
        <FieldError id="u-err">{error}</FieldError>
      </form>
    </Section>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true); setError(null);
    try {
      await api("/api/account/password", { body: { currentPassword: current, newPassword: next } });
      setCurrent(""); setNext("");
      toast.success("Password changed");
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return (
    <Section title="Password">
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-3">
        <div><Label htmlFor="pw-cur">Current password</Label><Input id="pw-cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
        <div><Label htmlFor="pw-new">New password</Label><Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} aria-describedby="pw-hint" /><Hint>At least 10 characters, with a letter and a number.</Hint></div>
        <FieldError>{error}</FieldError>
        <Button type="submit" disabled={!current || next.length < 10 || busy} loading={busy}>Change password</Button>
      </form>
    </Section>
  );
}

function DangerZone() {
  const { profile } = useApp();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [busy, setBusy] = useState(false);
  async function remove() {
    setBusy(true);
    try {
      await api("/api/account/delete", { body: { confirmUsername: confirmName } });
      router.replace("/login");
      router.refresh();
    } catch (e) { toast.error(errorMessage(e)); setBusy(false); }
  }
  return (
    <>
      <Section title="Your data" description="Download everything we store about you, or delete your account.">
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="glass"><a href="/api/account/export" download><Download className="h-4 w-4" aria-hidden />Download my data (JSON)</a></Button>
        </div>
        <p className="text-xs text-muted">The export contains your profile, settings, notes, link records, chat records, collections and file metadata. File contents are not included; download those from All Files.</p>
      </Section>
      <Section title="Delete account" danger description="Permanently deletes your account, every stored file and everything derived from it. This cannot be undone.">
        <Button variant="danger" onClick={() => setOpen(true)}>Delete my account…</Button>
      </Section>
      <Dialog open={open} onOpenChange={(o) => { if (!busy) { setOpen(o); setConfirmName(""); } }}>
        <DialogContent title="Delete your account?" description="All files, notes, links, chats, collections and shares are deleted immediately.">
          <form onSubmit={(e) => { e.preventDefault(); void remove(); }} className="space-y-3">
            <Label htmlFor="del-name">Type <strong>{profile.username}</strong> to confirm</Label>
            <Input id="del-name" autoFocus autoComplete="off" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" variant="danger" loading={busy} disabled={confirmName.trim().toLowerCase() !== profile.username.toLowerCase()}>Delete everything</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

const EVENT_TEXT: Record<string, (m: Record<string, unknown>) => string> = {
  "account.password_changed": () => "Password changed",
  "auth.password_changed": () => "Password reset",
  "profile.username_changed": (m) => `Username changed${m.to ? ` to @${String(m.to)}` : ""}`,
  "privacy.processing_mode_changed": (m) => `Privacy mode set to ${String(m.mode ?? "a new value").replace("_", " ")}`,
  "account.exported": () => "Data export downloaded",
  "share.created": () => "You shared a file",
  "share.accepted": () => "You accepted a shared file",
  "share.declined": () => "You declined a shared file",
  "share.revoked": () => "A share was revoked",
  "share.file_viewed": (m) => `${m.viewer ? `@${String(m.viewer)}` : "Someone"} viewed${m.file ? ` “${String(m.file)}”` : " a file you shared"}`,
  "share.file_downloaded": (m) => `${m.viewer ? `@${String(m.viewer)}` : "Someone"} downloaded${m.file ? ` “${String(m.file)}”` : " a file you shared"}`,
  "integration.telegram_link_code_created": () => "Telegram link code created",
  "integration.disconnected": () => "An app was disconnected",
  "files.reindex_all": () => "All files were re-processed",
  "import.deleted": () => "An import was removed",
};

function Activity() {
  const q = useFetch<{ events: { id: string; event: string; created_at: string; metadata: Record<string, unknown> }[] }>("/api/account/activity");
  return (
    <Section title="Recent account activity" description="Security-relevant events on your account, including when people you've shared files with open them. Sign-in events are kept by the authentication service and aren't listed here.">
      {q.loading ? <Skeleton className="h-16" /> : q.error ? <p role="alert" className="text-sm text-danger">{q.error}</p> : (q.data?.events.length ?? 0) === 0 ? <p className="text-sm text-muted">Nothing yet.</p> : (
        <ul className="divide-y divide-[rgb(var(--line)/0.1)] text-sm">
          {q.data!.events.map((e) => <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2"><span>{(EVENT_TEXT[e.event] ?? (() => e.event))(e.metadata)}</span><span className="text-xs text-muted">{formatDateTime(e.created_at)}</span></li>)}
        </ul>
      )}
    </Section>
  );
}

export function AccountTab() {
  return <div className="space-y-5"><ProfileForm /><UsernameForm /><PasswordForm /><Activity /><DangerZone /></div>;
}
