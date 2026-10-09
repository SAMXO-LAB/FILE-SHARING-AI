"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Brain, ChevronsLeft, ChevronsRight, ChevronsUpDown, FileText, Files, House, ImageIcon, Layers, Link2, LogOut, MessagesSquare, Moon, Plug, Plus, Settings, Sparkles, Sun, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Tooltip } from "@/components/ui/overlay";
import { api, errorMessage } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { useAddToMemory } from "./add-dialog";
import { useApp } from "./app-context";
import { LogoMark } from "./auth-shell";
import { useUploads } from "./upload-context";

type NavEntry = { href: string; label: string; icon: typeof House };
/** Grouped so the long list scans easily; order and destinations are unchanged. */
export const NAV_GROUPS: { label?: string; items: NavEntry[] }[] = [
  { items: [
    { href: "/", label: "Home", icon: House },
    { href: "/ask", label: "Ask AI", icon: Sparkles },
    { href: "/memory", label: "My Memory", icon: Brain },
  ] },
  { label: "Library", items: [
    { href: "/files", label: "All Files", icon: Files },
    { href: "/documents", label: "Documents", icon: FileText },
    { href: "/media", label: "Images and Videos", icon: ImageIcon },
    { href: "/links", label: "Saved Links", icon: Link2 },
    { href: "/conversations", label: "Conversations", icon: MessagesSquare },
    { href: "/collections", label: "Collections", icon: Layers },
  ] },
  { label: "Manage", items: [
    { href: "/integrations", label: "Connected Apps", icon: Plug },
    { href: "/uploads", label: "Uploads", icon: UploadCloud },
    { href: "/settings", label: "Settings", icon: Settings },
  ] },
];
export const NAV = NAV_GROUPS.flatMap((g) => g.items);

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

export function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const path = usePathname();
  const { activeCount } = useUploads();
  return (
    <nav aria-label="Main" className="flex flex-col gap-4">
      {NAV_GROUPS.map((group, gi) => (
        <div key={gi} className="flex flex-col gap-0.5">
          {group.label && (collapsed ? <div className="mx-auto mb-1 h-px w-6 bg-[rgb(var(--line)/0.1)]" aria-hidden /> : <p className="eyebrow mb-1 px-3 !text-[11px] !text-subtle">{group.label}</p>)}
          {group.items.map(({ href, label, icon: Icon }) => {
            const active = isActive(path, href);
            const link = (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                aria-label={collapsed ? label : undefined}
                className={cn("nav-item relative flex h-9 items-center gap-3 rounded-[10px] px-3 text-[14px]", collapsed && "justify-center px-0")}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} aria-hidden />
                {!collapsed && <span className="truncate">{label}</span>}
                {href === "/uploads" && activeCount > 0 && (
                  <span className={cn("grid min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-semibold leading-5 text-accent-fg", collapsed ? "absolute right-1 top-0.5" : "ml-auto")} aria-label={`${activeCount} uploading`}>{activeCount}</span>
                )}
              </Link>
            );
            return collapsed ? <Tooltip key={href} label={label}>{link}</Tooltip> : link;
          })}
        </div>
      ))}
    </nav>
  );
}

export function UserMenu({ collapsed }: { collapsed?: boolean }) {
  const { profile, email, prefs, updatePrefs } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const initials = (profile.display_name || profile.username).slice(0, 2).toUpperCase();
  const dark = typeof document !== "undefined" ? document.documentElement.getAttribute("data-mode") === "dark" : prefs.color_mode === "dark";
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
        <button className={cn("group flex w-full items-center gap-3 rounded-[12px] p-2 text-left transition-colors hover:bg-[rgb(var(--line)/0.045)]", collapsed && "justify-center")} aria-label="Account menu">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-accent/15 bg-accent-soft text-[12px] font-semibold text-accent">{initials}</span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-medium leading-5">{profile.display_name || profile.username}</span><span className="block truncate text-xs text-muted">@{profile.username}</span></span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-subtle group-hover:text-muted" aria-hidden />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuLabel>{email}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => router.push("/settings")}><Settings className="h-4 w-4" aria-hidden />Settings</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void updatePrefs({ color_mode: dark ? "light" : "dark" }).catch((e) => toast.error(errorMessage(e)))}>
          {dark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}{dark ? "Light mode" : "Dark mode"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); void signOut(); }} disabled={busy}><LogOut className="h-4 w-4" aria-hidden />Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const SIDEBAR_W = { open: 272, collapsed: 76 };

export function Sidebar({ mobileOpen, onMobileClose }: { mobileOpen: boolean; onMobileClose: () => void }) {
  const { prefs, updatePrefs } = useApp();
  const { openAdd } = useAddToMemory();
  const collapsed = prefs.sidebar_collapsed;

  const content = (isMobile: boolean) => {
    const c = collapsed && !isMobile;
    return (
      <div className="flex h-full flex-col">
        <div className={cn("flex h-16 shrink-0 items-center", c ? "justify-center" : "justify-between px-5")}>
          <Link href="/" onClick={onMobileClose} aria-label="Universal AI Memory, home" className="flex min-w-0 items-center gap-2.5 rounded-lg">
            <LogoMark size="sm" />
            {!c && <span className="truncate text-[15px] font-semibold tracking-[-0.015em]">Universal AI Memory</span>}
          </Link>
          {isMobile && <Button size="icon-sm" variant="ghost" aria-label="Close menu" onClick={onMobileClose}><X className="h-4 w-4" /></Button>}
        </div>
        <div className={cn("shrink-0 pb-4", c ? "px-3" : "px-4")}>
          {c ? (
            <Tooltip label="Add to Memory"><Button size="icon" onClick={() => { openAdd(); onMobileClose(); }} aria-label="Add to Memory" className="mx-auto flex h-10 w-10"><Plus className="h-[18px] w-[18px]" /></Button></Tooltip>
          ) : (
            <Button onClick={() => { openAdd(); onMobileClose(); }} className="h-10 w-full gap-2"><Plus className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden />Add to Memory</Button>
          )}
        </div>
        <div className={cn("no-scrollbar min-h-0 flex-1 overflow-y-auto pb-4", c ? "px-3" : "px-3")}><NavList collapsed={c} onNavigate={onMobileClose} /></div>
        <div className={cn("shrink-0 space-y-0.5 border-t hairline p-3")}>
          <UserMenu collapsed={c} />
          {!isMobile && (
            <button
              onClick={() => void updatePrefs({ sidebar_collapsed: !collapsed }).catch((e) => toast.error(errorMessage(e)))}
              className={cn("nav-item flex h-8 w-full items-center gap-3 rounded-[10px] px-3 text-[13px]", c && "justify-center px-0")}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronsRight className="h-4 w-4" aria-hidden /> : <><ChevronsLeft className="h-4 w-4" aria-hidden />Collapse sidebar</>}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <aside
        className="sidebar-surface fixed inset-y-0 left-0 z-30 hidden transition-[width] duration-200 ease-out lg:block"
        style={{ width: collapsed ? SIDEBAR_W.collapsed : SIDEBAR_W.open }}
      >
        {content(false)}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-[2px]" aria-label="Close menu" onClick={onMobileClose} />
          <aside className="sidebar-surface animate-rise absolute inset-y-0 left-0 w-[min(18.5rem,calc(100vw-3rem))] shadow-[var(--shadow-lg)]" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>{content(true)}</aside>
        </div>
      )}
    </>
  );
}
