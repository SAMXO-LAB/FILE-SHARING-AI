"use client";
import { useState } from "react";
import { Menu, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogProvider } from "@/components/ui/confirm";
import { TooltipProvider } from "@/components/ui/overlay";
import { cn } from "@/lib/utils";
import { AddToMemoryProvider, useAddToMemory } from "./add-dialog";
import { useApp } from "./app-context";
import { DropOverlay } from "./drop-overlay";
import { ImportWatcher } from "./import-watcher";
import { Logo } from "./auth-shell";
import { Sidebar } from "./sidebar";
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
      <header className="glass glass-strong sticky top-0 z-20 m-3 mb-0 flex items-center gap-2 !rounded-2xl px-3 py-2 lg:hidden">
        <Button size="icon-sm" variant="ghost" aria-label="Open menu" onClick={() => setMenu(true)}><Menu className="h-5 w-5" /></Button>
        <Logo className="flex-1 text-sm" />
        <Button size="icon-sm" onClick={() => openAdd()} aria-label="Add to Memory"><Plus className="h-4 w-4" /></Button>
      </header>
      <main id="main" className={cn("px-4 pb-24 pt-6 sm:px-6 lg:pr-8 lg:pt-8 transition-[padding] duration-200", prefs.sidebar_collapsed ? "lg:pl-[104px]" : "lg:pl-[296px]")}>
        <div className="mx-auto w-full max-w-6xl">{children}</div>
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
