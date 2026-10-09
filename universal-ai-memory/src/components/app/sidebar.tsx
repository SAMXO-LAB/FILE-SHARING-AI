"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Brain, ChevronsLeft, ChevronsRight, FileText, Files, House, ImageIcon, Layers, Link2, LogOut, MessagesSquare, Plug, Plus, Settings, Sparkles, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Tooltip } from "@/components/ui/overlay";
import { api, errorMessage } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { useAddToMemory } from "./add-dialog";
import { useApp } from "./app-context";
import { Logo } from "./auth-shell";
import { useUploads } from "./upload-context";

export const NAV = [
  { href: "/", label: "Home", icon: House },
  { href: "/ask", label: "Ask AI", icon: Sparkles },
  { href: "/memory", label: "My Memory", icon: Brain },
  { href: "/files", label: "All Files", icon: Files },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/media", label: "Images and Videos", icon: ImageIcon },
  { href: "/links", label: "Saved Links", icon: Link2 },
  { href: "/conversations", label: "Conversations", icon: MessagesSquare },
  { href: "/collections", label: "Collections", icon: Layers },
  { href: "/integrations", label: "Connected Apps", icon: Plug },
  { href: "/uploads", label: "Uploads", icon: UploadCloud },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

export function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const path = usePathname();
  const { activeCount } = useUploads();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(path, href);
        const link = (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn("relative flex h-10 items-center gap-3 rounded-[calc(var(--radius)*0.6)] px-3 text-sm transition-colors", active ? "bg-accent/18 font-medium text-fg shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_40%,transparent)]" : "text-muted hover:bg-[rgb(var(--line)/0.09)] hover:text-fg", collapsed && "justify-center px-0")}
          >
            <Icon className={cn("h-[18px] w-[18px] shrink-0", active && "text-accent")} aria-hidden />
            {!collapsed && <span className="truncate">{label}</span>}
            {href === "/uploads" && activeCount > 0 && (
              <span className={cn("grid min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-fg", collapsed ? "absolute right-1 top-1" : "ml-auto")} aria-label={`${activeCount} uploading`}>{activeCount}</span>
            )}
          </Link>
        );
        return collapsed ? <Tooltip key={href} label={label}>{link}</Tooltip> : link;
      })}
    </nav>
  );
}

export function UserMenu({ collapsed }: { collapsed?: boolean }) {
  const { profile, email } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const initials = (profile.display_name || profile.username).slice(0, 2).toUpperCase();
  async function signOut() {
    setBusy(true);
    try {
      await api("/api/auth/logout", { method: "POST", body: {} });
      router.replace("/login");
      router.refresh();
    } catch (e) {
      toast.error("Couldn't sign out", { description: errorMessage(e) });
      setBusy(false);
    }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={cn("flex w-full items-center gap-3 rounded-[calc(var(--radius)*0.6)] p-2 text-left hover:bg-[rgb(var(--line)/0.09)]", collapsed && "justify-center")} aria-label="Account menu">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/20 text-xs font-semibold text-accent">{initials}</span>
          {!collapsed && <span className="min-w-0"><span className="block truncate text-sm font-medium">{profile.display_name || profile.username}</span><span className="block truncate text-xs text-muted">@{profile.username}</span></span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start">
        <DropdownMenuLabel>{email}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => router.push("/settings")}><Settings className="h-4 w-4" aria-hidden />Settings</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); void signOut(); }} disabled={busy}><LogOut className="h-4 w-4" aria-hidden />Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Sidebar({ mobileOpen, onMobileClose }: { mobileOpen: boolean; onMobileClose: () => void }) {
  const { prefs, updatePrefs } = useApp();
  const { openAdd } = useAddToMemory();
  const collapsed = prefs.sidebar_collapsed;

  const content = (isMobile: boolean) => {
    const c = collapsed && !isMobile;
    return (
      <div className="flex h-full flex-col gap-4 p-3">
        <div className={cn("flex items-center", c ? "justify-center" : "justify-between px-1")}>
          {c ? <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-accent-fg"><Brain className="h-5 w-5" aria-hidden /></span> : <Link href="/" onClick={onMobileClose}><Logo className="text-[15px]" /></Link>}
          {isMobile && <Button size="icon-sm" variant="ghost" aria-label="Close menu" onClick={onMobileClose}><X className="h-4 w-4" /></Button>}
        </div>
        {c ? (
          <Tooltip label="Add to Memory"><Button size="icon" onClick={() => { openAdd(); onMobileClose(); }} aria-label="Add to Memory" className="mx-auto"><Plus className="h-5 w-5" /></Button></Tooltip>
        ) : (
          <Button onClick={() => { openAdd(); onMobileClose(); }} className="w-full justify-start gap-2"><Plus className="h-4 w-4" aria-hidden />Add to Memory</Button>
        )}
        <div className="-mx-1 flex-1 overflow-y-auto px-1"><NavList collapsed={c} onNavigate={onMobileClose} /></div>
        <div className="space-y-1 border-t hairline pt-3">
          <UserMenu collapsed={c} />
          {!isMobile && (
            <button
              onClick={() => void updatePrefs({ sidebar_collapsed: !collapsed }).catch((e) => toast.error(errorMessage(e)))}
              className={cn("flex h-9 w-full items-center gap-3 rounded-[calc(var(--radius)*0.6)] px-3 text-xs text-muted hover:bg-[rgb(var(--line)/0.09)] hover:text-fg", c && "justify-center px-0")}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronsRight className="h-4 w-4" aria-hidden /> : <><ChevronsLeft className="h-4 w-4" aria-hidden />Collapse</>}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <aside className={cn("sidebar-surface glass fixed inset-y-3 left-3 z-30 hidden !rounded-[calc(var(--radius)*1.1)] transition-[width] duration-200 lg:block", collapsed ? "w-[72px]" : "w-64")}>{content(false)}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-black/55 backdrop-blur-sm" aria-label="Close menu" onClick={onMobileClose} />
          <aside className="glass glass-strong absolute inset-y-3 left-3 w-[min(20rem,calc(100vw-1.5rem))]">{content(true)}</aside>
        </div>
      )}
    </>
  );
}
