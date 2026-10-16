"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronsUpDownIcon, LogOutIcon, MenuIcon, MonitorIcon, MoonIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { initials, useLogout } from "@moa/app-kit";
import type { SessionUser } from "@moa/auth";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  cn,
} from "@moa/ui";

import { Breadcrumbs } from "./breadcrumbs";
import { GateCard } from "./gate-card";
import { SidebarNav } from "./sidebar-nav";

/**
 * Two sheets on a canvas: the rail and the page.
 *
 * The shell is exactly one viewport tall; the rail stays where it is and
 * only the page scrolls, so a long guest list never scrolls the menu away.
 * The rail collapses to its tiles on request and always on a tablet; on a
 * phone it is a drawer. The top bar carries only the trail; the account and
 * the appearance choice sit with the club's name at the foot of the rail.
 */
/** The product's name, top left; the club signed in sits at the bottom with its account. */
const PRODUCT = "MyOtherApp";

function Brand({ collapsed, onToggle }: { collapsed: boolean; onToggle?: () => void }) {
  return (
    <div className={cn("flex items-start gap-2 px-4 pt-[18px] pb-[14px]", collapsed && "flex-col items-center px-0")}>
      <Link href="/" className={cn("flex min-w-0 flex-1 items-center gap-2.5 pl-0.5", collapsed && "hidden")} aria-label="MyOtherApp Clubs home">
        <Image src="/brand/icon.png" alt="" width={32} height={32} className="size-8 shrink-0 rounded-[9px]" priority unoptimized />
        <span className="min-w-0">
          <span className="text-ink block truncate text-[15px] leading-[1.15] font-semibold tracking-[-0.02em]">{PRODUCT}</span>
          <span className="eyebrow block">Clubs</span>
        </span>
      </Link>
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className="border-line bg-surface text-ink-2 hover:bg-sunken hover:text-ink grid size-8 shrink-0 place-items-center rounded-full border transition-colors"
        >
          {collapsed ? <PanelLeftOpenIcon className="size-4" /> : <PanelLeftCloseIcon className="size-4" />}
        </button>
      ) : (
        <Image src="/brand/icon.png" alt={PRODUCT} width={32} height={32} className={cn("hidden size-8 shrink-0 rounded-[9px]", collapsed && "block")} unoptimized />
      )}
    </div>
  );
}

const THEMES = [
  { value: "system", label: "Follow the system", Icon: MonitorIcon },
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
] as const;

/**
 * The club signed in, at the foot of the rail. The whole card is one button:
 * it opens the account menu, where the appearance choice and sign-out live,
 * so the row itself is only a name and never crowds at 236px.
 */
function Identity({ user, clubName, collapsed }: { user: SessionUser; clubName: string; collapsed: boolean }) {
  const router = useRouter();
  const logout = useLogout();
  const { theme, setTheme } = useTheme();
  const mode = THEMES.some((t) => t.value === theme) ? (theme as string) : "system";

  async function signOut() {
    await logout.mutateAsync();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className={cn("px-3 pb-3.5", collapsed && "px-2")}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`${clubName}: account and appearance`}
            className={cn(
              "bg-sunken hover:bg-raised focus-visible:ring-brand/40 flex w-full items-center gap-2.5 rounded-[var(--radius-card)] p-2 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none",
              collapsed && "justify-center p-1.5"
            )}
          >
            <span className="bg-brand-soft text-brand grid size-8 shrink-0 place-items-center rounded-full font-mono text-[11px] font-semibold">{initials(clubName)}</span>
            <span className={cn("min-w-0 flex-1", collapsed && "hidden")}>
              <span className="text-ink block truncate text-[12.5px] font-semibold">{clubName}</span>
              <span className="text-ink-3 block truncate font-mono text-[10px] tracking-[0.04em]">Shared club login</span>
            </span>
            <ChevronsUpDownIcon className={cn("text-ink-3 size-4 shrink-0", collapsed && "hidden")} aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side={collapsed ? "right" : "top"} align={collapsed ? "end" : "start"} sideOffset={8} className="w-60">
          <DropdownMenuLabel className="font-normal">
            <span className="block truncate text-sm font-medium">{clubName}</span>
            <span className="text-ink-3 block truncate text-xs">{user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="eyebrow">Appearance</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={mode} onValueChange={setTheme}>
            {THEMES.map(({ value, label, Icon }) => (
              <DropdownMenuRadioItem key={value} value={value}>
                <Icon className="size-4" aria-hidden="true" /> {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={signOut} disabled={logout.isPending}>
            <LogOutIcon className="size-4" aria-hidden="true" /> {logout.isPending ? "Signing out…" : "Sign out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function Rail({ user, clubName, collapsed, onNavigate, onToggle }: { user: SessionUser; clubName: string; collapsed: boolean; onNavigate?: () => void; onToggle?: () => void }) {
  return (
    <div className="flex min-h-full flex-col">
      <Brand collapsed={collapsed} onToggle={onToggle} />
      <SidebarNav collapsed={collapsed} onNavigate={onNavigate} />
      <div className="flex-1" />
      <div className={cn("p-3 empty:hidden", collapsed && "hidden")}>
        <GateCard />
      </div>
      <Identity user={user} clubName={clubName} collapsed={collapsed} />
    </div>
  );
}

export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const clubName = user.full_name || user.username || "My Other App";

  // <main> is the scroller, not the window, so a new page is put back at the top here.
  const mainRef = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  // overflow-clip, not overflow-hidden: a hidden box can still be scrolled by
  // a #fragment link or scrollIntoView, which slid the whole shell up and left
  // the canvas showing beneath it. Clip forbids that; only <main> scrolls.
  return (
    <div className="bg-canvas flex h-dvh flex-col overflow-clip">
      <div className="flex min-h-0 flex-1 gap-3.5 p-3.5 max-sm:p-2">
        <aside
          className={cn(
            "scroll-thin bg-surface shadow-card hidden shrink-0 flex-col overflow-x-hidden overflow-y-auto rounded-[var(--radius-sheet)] transition-[width] duration-200 lg:flex",
            collapsed ? "w-[68px]" : "w-[236px]"
          )}
        >
          <Rail user={user} clubName={clubName} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
        </aside>

        <div className="bg-surface shadow-card flex min-h-0 min-w-0 flex-1 flex-col overflow-clip rounded-[var(--radius-sheet)]">
          <div className="flex h-[62px] shrink-0 items-center gap-2.5 px-4 max-sm:px-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                  <MenuIcon />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="bg-surface w-[260px] border-none p-0">
                <SheetHeader className="sr-only">
                  <SheetTitle>Navigation</SheetTitle>
                </SheetHeader>
                <Rail user={user} clubName={clubName} collapsed={false} onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
            <div className="bg-sunken flex min-w-0 flex-1 items-center gap-2 rounded-full px-4 py-[10px]">
              <Breadcrumbs />
            </div>
          </div>
          <main ref={mainRef} className="scroll-thin min-h-0 flex-1 overflow-auto">
            <div className="mx-auto max-w-[1180px] px-6 pt-5 pb-16 max-sm:px-4">{children}</div>
          </main>
        </div>
      </div>

      {/* The rail is behind the menu on a phone, so this is the only route
          back to the dashboard for a keyboard or screen reader. */}
      <Link href="/" className="sr-only">
        Dashboard
      </Link>
    </div>
  );
}
