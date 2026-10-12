"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon, PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import { UserMenu, initials } from "@moa/app-kit";
import type { SessionUser } from "@moa/auth";
import { Button, Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, cn } from "@moa/ui";

import { Breadcrumbs } from "./breadcrumbs";
import { GateCard } from "./gate-card";
import { SidebarNav } from "./sidebar-nav";
import { ThemeToggle } from "./theme-toggle";

/**
 * Two sheets on a canvas: the rail and the page.
 *
 * The shell is exactly one viewport tall; the rail stays where it is and
 * only the page scrolls, so a long guest list never scrolls the menu away.
 * The rail collapses to its tiles on request and always on a tablet; on a
 * phone it is a drawer. The top bar carries the trail, the theme and the
 * account — the three things every page needs and no page should draw.
 */
/** The product's name, top left; the club signed in sits at the bottom with its account. */
const PRODUCT = "MyOtherApp";

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cn("px-5 pt-[22px] pb-[18px]", collapsed && "px-0 text-center")}>
      <span className="text-ink block truncate text-[15px] font-semibold tracking-[-0.02em]">{collapsed ? PRODUCT.slice(0, 2) : PRODUCT}</span>
      <span className={cn("eyebrow block", collapsed && "hidden")}>Clubs</span>
    </div>
  );
}

function Identity({ user, clubName, collapsed }: { user: SessionUser; clubName: string; collapsed: boolean }) {
  return (
    <div className="px-3 pb-3.5">
      <div className={cn("bg-sunken flex items-center gap-2 rounded-[var(--radius-card)] p-2", collapsed && "flex-col p-1.5")}>
        <span className="bg-brand-soft text-brand grid size-8 shrink-0 place-items-center rounded-full font-mono text-[11px] font-semibold">{initials(clubName)}</span>
        <div className={cn("min-w-0 flex-1", collapsed && "hidden")}>
          <div className="truncate text-[12.5px] font-semibold">{clubName}</div>
          <div className="text-ink-3 truncate font-mono text-[10px] tracking-[0.04em]">shared club login</div>
        </div>
        <div className={cn("flex shrink-0 items-center gap-1", collapsed && "flex-col")}>
          <ThemeToggle className="size-8" />
          <UserMenu user={user} />
        </div>
      </div>
    </div>
  );
}

function Rail({ user, clubName, collapsed, onNavigate }: { user: SessionUser; clubName: string; collapsed: boolean; onNavigate?: () => void }) {
  return (
    <div className="flex min-h-full flex-col">
      <Brand collapsed={collapsed} />
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

  return (
    <div className="bg-canvas flex h-dvh flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 gap-3.5 p-3.5 max-sm:p-2">
        <aside
          className={cn(
            "scroll-thin bg-surface shadow-card hidden shrink-0 flex-col overflow-x-hidden overflow-y-auto rounded-[var(--radius-sheet)] transition-[width] duration-200 lg:flex",
            collapsed ? "w-[68px]" : "w-[236px]"
          )}
        >
          <Rail user={user} clubName={clubName} collapsed={collapsed} />
        </aside>

        <div className="bg-surface shadow-card flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-sheet)]">
          <div className="flex h-[62px] shrink-0 items-center gap-2.5 px-4 max-sm:px-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0 rounded-full lg:hidden" aria-label="Open menu">
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
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              className="border-line bg-surface text-ink-2 hover:bg-sunken hover:text-ink hidden size-9 shrink-0 place-items-center rounded-full border transition-colors lg:grid"
            >
              {collapsed ? <PanelLeftOpenIcon className="size-4" /> : <PanelLeftCloseIcon className="size-4" />}
            </button>
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
