"use client";
import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { desktopState, enableDesktopNotifications, getNotifySettings, NOTIFY_CHANGED, playPing, setNotifySettings, type DesktopState, type NotifySettings } from "@/lib/client/notify";
import { useApp } from "@/components/app/app-context";
import { errorMessage } from "@/lib/client/api";
import type { Preferences } from "@/lib/types";
import { Section, ToggleRow } from "./parts";

const ITEMS: { key: keyof Preferences; label: string; description: string }[] = [
  { key: "notify_upload_complete", label: "Uploads finished", description: "Show a message when an upload has been added to your memory." },
  { key: "notify_processing_complete", label: "Processing finished", description: "Show a message when a file or link has been read and indexed." },
  { key: "notify_import_failures", label: "Import problems", description: "Tell me when a chat import fails or skips content." },
];

function FriendNotifications() {
  const [s, setS] = useState<NotifySettings>({ popups: true, desktop: true, sound: true });
  const [perm, setPerm] = useState<DesktopState>("default");
  useEffect(() => {
    const read = () => { setS(getNotifySettings()); setPerm(desktopState()); };
    read();
    window.addEventListener(NOTIFY_CHANGED, read);
    return () => window.removeEventListener(NOTIFY_CHANGED, read);
  }, []);
  return (
    <Section title="Friends and sharing" description="When friends send you files or messages, accept your request, or receive what you sent. Saved on this device.">
      <ToggleRow id="n-friend-popups" label="Pop-ups in the app" description="A message in the corner while Share Files AI is open." checked={s.popups} onChange={(v) => setNotifySettings({ popups: v })} />
      <ToggleRow id="n-friend-desktop" label="System notifications" description={perm === "denied" ? "Blocked in your browser settings. Allow notifications for this site there, then reload." : perm === "unsupported" ? "This browser doesn't support notifications." : "Shown by your computer or phone when Share Files AI is open in another tab or minimised."} checked={s.desktop && perm === "granted"} onChange={(v) => { if (v && perm !== "granted") void enableDesktopNotifications().then((r) => { if (r !== "granted") toast.error("Notifications weren't allowed", { description: "You can allow them in your browser's site settings." }); }); else setNotifySettings({ desktop: v }); }} />
      {perm === "default" && <Button variant="glass" size="sm" onClick={() => void enableDesktopNotifications()}><BellRing className="h-4 w-4" aria-hidden />Allow notifications</Button>}
      <ToggleRow id="n-friend-sound" label="Sound" description="A soft chime when a file arrives or is delivered." checked={s.sound} onChange={(v) => { setNotifySettings({ sound: v }); if (v) playPing("receive"); }} />
    </Section>
  );
}

export function NotificationsTab() {
  const { prefs, updatePrefs } = useApp();
  return (
    <div className="space-y-5">
    <FriendNotifications />
    <Section title="Uploads and imports" description="Pop-up messages about your own uploads while the app is open. This app doesn't send emails.">
      {ITEMS.map((i) => (
        <ToggleRow key={i.key} id={`n-${i.key}`} label={i.label} description={i.description} checked={Boolean(prefs[i.key])} onChange={(v) => void updatePrefs({ [i.key]: v } as Partial<Preferences>).catch((e) => toast.error(errorMessage(e)))} />
      ))}
    </Section>
    </div>
  );
}
