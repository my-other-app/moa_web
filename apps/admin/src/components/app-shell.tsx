"use client";

import * as React from "react";
import Link from "next/link";
import { MenuIcon, ShieldIcon } from "lucide-react";
import { UserMenu } from "@moa/app-kit";
import type { SessionUser } from "@moa/auth";
import { roleOf } from "@moa/auth";
import {
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  cn,
} from "@moa/ui";

import { SidebarNav } from "./sidebar-nav";
import { CommandPalette } from "./command-palette";
import { SystemStatusCard } from "./system-status-card";

/**
 * v2 admin shell.
 *
 * A 232px sticky rail, then a 1280px main column. The rail carries the brand,
 * the grouped nav, a system-status card and the signed-in identity; the top bar
 * carries search, notifications and the user menu.
 *
 * The rail is not a Sheet-only-on-mobile afterthought: below `lg` it becomes
 * one, and the top bar keeps the trigger, so every destination stays reachable
 * on a phone. The design specifies the rail at a fixed width, so the main
 * column is what flexes.
 */
const ROLE_NOTE: Record<string, string> = {
  owner: "Can do everything, including refunds, deletes and snapshots.",
  support: "Can moderate and restore. Money, deletes and roles are hidden.",
  viewer: "Read-only. Every action control is hidden.",
};

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-1.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[var(--color-accent-900)] text-[var(--color-accent-300)] shadow-[inset_0_0_0_1px_var(--color-accent-700)]">
        <ShieldIcon className="size-[18px]" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-medium">MyOtherApp</span>
        <span className="text-[11px] text-[var(--color-neutral-500)]">
          Platform admin
        </span>
      </span>
    </div>
  );
}

function Identity({ user }: { user: SessionUser }) {
  const role = roleOf(user) ?? "viewer";
  const name = user.full_name || user.username;
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-md)] bg-[color-mix(in_srgb,var(--color-surface)_70%,transparent)] p-3 shadow-[var(--shadow-sm)]">
      <div className="flex items-center gap-2.5">
        <span className="grid size-[30px] shrink-0 place-items-center rounded-full bg-[var(--color-accent-800)] text-[12px] text-[var(--color-accent-100)]">
          {initials}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[13px]">{name}</span>
          <span className="text-[11px] text-[var(--color-neutral-500)] capitalize">
            {role}
          </span>
        </span>
      </div>
      <span className="text-[11px] text-pretty text-[var(--color-neutral-500)]">
        {ROLE_NOTE[role]}
      </span>
    </div>
  );
}

function Rail({
  user,
  badges,
  onNavigate,
}: {
  user: SessionUser;
  badges?: Record<string, string>;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex min-h-full flex-col gap-4 px-3.5 py-5">
      <Brand />
      <SidebarNav badges={badges} onNavigate={onNavigate} />
      <div className="mt-auto flex flex-col gap-2">
        <SystemStatusCard />
        <Identity user={user} />
      </div>
    </div>
  );
}

export function AppShell({
  user,
  badges,
  children,
}: {
  user: SessionUser;
  badges?: Record<string, string>;
  children: React.ReactNode;
}) {
  // Closed by the nav items' own onNavigate rather than an effect watching the
  // pathname: that costs an extra render and fires on every route change,
  // including ones the sheet was never open for.
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-[232px] shrink-0 shadow-[1px_0_0_var(--color-neutral-900)] lg:block">
        <div className="sticky top-0 min-h-dvh">
          <Rail user={user} badges={badges} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main
          className={cn(
            // overflow-x-clip rather than hidden: it contains a child that
            // overruns without creating a scroll container, so sticky
            // positioning inside the page keeps working.
            "mx-auto flex w-full max-w-[1280px] min-w-0 flex-1 flex-col gap-6 overflow-x-clip",
            "px-[clamp(16px,3vw,40px)] pt-[22px] pb-[60px]"
          )}
        >
          <div className="flex items-center gap-2.5 pb-3.5 shadow-[inset_0_-1px_0_var(--color-neutral-900)]">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 lg:hidden"
                  aria-label="Open menu"
                >
                  <MenuIcon />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-[260px] border-none bg-[var(--color-bg)] p-0"
              >
                <SheetHeader className="sr-only">
                  <SheetTitle>Navigation</SheetTitle>
                </SheetHeader>
                <Rail
                  user={user}
                  badges={badges}
                  onNavigate={() => setMobileOpen(false)}
                />
              </SheetContent>
            </Sheet>

            <CommandPalette />
            <span className="flex-1" />
            <UserMenu user={user} />
          </div>

          {children}
        </main>
      </div>

      {/* The brand mark is the only way back to Overview on a phone, since the
          rail is behind the menu. */}
      <Link href="/" className="sr-only">
        Overview
      </Link>
    </div>
  );
}
