"use client";
import { toast } from "sonner";
import { useApp } from "@/components/app/app-context";
import { errorMessage } from "@/lib/client/api";
import type { Preferences } from "@/lib/types";
import { Section, ToggleRow } from "./parts";

const ITEMS: { key: keyof Preferences; label: string; description: string }[] = [
  { key: "notify_upload_complete", label: "Uploads finished", description: "Show a message when an upload has been added to your memory." },
  { key: "notify_processing_complete", label: "Processing finished", description: "Show a message when a file or link has been read and indexed." },
  { key: "notify_import_failures", label: "Import problems", description: "Tell me when a chat import fails or skips content." },
];

export function NotificationsTab() {
  const { prefs, updatePrefs } = useApp();
  return (
    <Section title="Notifications" description="These control the pop-up messages shown while the app is open. This app doesn't send emails or push notifications.">
      {ITEMS.map((i) => (
        <ToggleRow key={i.key} id={`n-${i.key}`} label={i.label} description={i.description} checked={Boolean(prefs[i.key])} onChange={(v) => void updatePrefs({ [i.key]: v } as Partial<Preferences>).catch((e) => toast.error(errorMessage(e)))} />
      ))}
    </Section>
  );
}
