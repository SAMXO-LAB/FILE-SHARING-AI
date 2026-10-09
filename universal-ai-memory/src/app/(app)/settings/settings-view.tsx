"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Bell, Cpu, HardDrive, Palette, Shield, User } from "lucide-react";
import { PageHeader } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { AccountTab } from "./account-tab";
import { AiTab } from "./ai-tab";
import { AppearanceTab } from "./appearance-tab";
import { NotificationsTab } from "./notifications-tab";
import { PrivacyTab } from "./privacy-tab";
import { StorageTab } from "./storage-tab";

const TABS = [
  { id: "account", label: "Account", icon: User },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "privacy", label: "Privacy", icon: Shield },
  { id: "storage", label: "Storage", icon: HardDrive },
  { id: "ai", label: "AI", icon: Cpu },
  { id: "notifications", label: "Notifications", icon: Bell },
] as const;

export function SettingsView() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("tab");
  const tab = TABS.some((t) => t.id === requested) ? (requested as string) : "account";
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" description="Your account, how the app looks, and what it's allowed to do with your content." />
      <Tabs value={tab} onValueChange={(v) => router.replace(`/settings?tab=${v}`, { scroll: false })}>
        <TabsList aria-label="Settings sections" className="flex-wrap">
          {TABS.map((t) => <TabsTrigger key={t.id} value={t.id}><t.icon className="h-4 w-4" aria-hidden />{t.label}</TabsTrigger>)}
        </TabsList>
        <TabsContent value="account"><AccountTab /></TabsContent>
        <TabsContent value="appearance"><AppearanceTab /></TabsContent>
        <TabsContent value="privacy"><PrivacyTab /></TabsContent>
        <TabsContent value="storage"><StorageTab /></TabsContent>
        <TabsContent value="ai"><AiTab /></TabsContent>
        <TabsContent value="notifications"><NotificationsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
