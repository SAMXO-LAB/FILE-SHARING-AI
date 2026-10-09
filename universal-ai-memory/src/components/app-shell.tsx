"use client";
import { useState } from "react";
import { Menu, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogProvider } from "@/components/ui/confirm";
import { TooltipProvider } from "@/components/ui/overlay";
import { AddToMemoryProvider, useAddToMemory } from "./add-dialog";
import { useApp } from "./app-context";
import { DropOverlay } from "./drop-overlay";
import { ImportWatcher } from "./import-watcher";
import { LogoMark } from "./auth-shell";
import { Sidebar, SIDEBAR_W } from "./sidebar";
import { UploadProvider } from "./upload-context";
import { UploadTray } from "./upload-tray";

function Frame({ children }: { children: React.ReactNode }) {
  const { prefs } = useApp();
  const { openAdd } = useAddToMemory();
  const [menu, setMenu] = useState(false);
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[90] focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-fg">Skip to content</a>
      <Sidebar mobileOpen={menu} onMobileClose={() => setMenu(false)} />
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b hairline bg-[color-mix(in_srgb,var(--card)_86%,transparent)] px-3 backdrop-blur-xl lg:hidden" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <Button size="icon" variant="ghost" aria-label="Open menu" onClick={() => setMenu(true)}><Menu className="h-5 w-5" /></Button>
        <span className="flex flex-1 items-center gap-2 text-[15px] font-semibold tracking-[-0.015em]"><LogoMark size="sm" />Universal AI Memory</span>
        <Button size="icon" onClick={() => openAdd()} aria-label="Add to Memory"><Plus className="h-[18px] w-[18px]" /></Button>
      </header>
      <main
        id="main"
        className="min-w-0 px-4 pb-24 pt-6 transition-[padding] duration-200 ease-out sm:px-6 lg:pl-[calc(var(--sidebar-w)+2.5rem)] lg:pr-10 lg:pt-10"
        style={{ ["--sidebar-w" as string]: `${prefs.sidebar_collapsed ? SIDEBAR_W.collapsed : SIDEBAR_W.open}px` }}
      >
        <div className="mx-auto w-full max-w-[1120px]">{children}</div>
      </main>
      <DropOverlay />
      <ImportWatcher />
      <UploadTray />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <DialogProvider>
        <UploadProvider>
          <AddToMemoryProvider>
            <Frame>{children}</Frame>
          </AddToMemoryProvider>
        </UploadProvider>
      </DialogProvider>
    </TooltipProvider>
  );
}
