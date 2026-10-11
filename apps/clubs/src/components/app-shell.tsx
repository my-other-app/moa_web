"use client";

import * as React from "react";
import Link from "next/link";
import { MenuIcon, UsersRoundIcon } from "lucide-react";
import { UserMenu, initials } from "@moa/app-kit";
import type { SessionUser } from "@moa/auth";
import {
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  cn,
} from "@moa/ui";

import { GateCard } from "./gate-card";
import { SidebarNav } from "./sidebar-nav";

/**
 * Shell for the club dashboard, on the v2 system.
 *
 * The same shape as the admin shell -- a 232px sticky rail, then a 1280px
 * main column -- because they are two views of one product and the clubs app
 * looking like a different generation of software was the most visible thing
 * wrong with it. Sharing the structure also means a fix to either lands in
 * both, which is the reason they share a component library at all.
 *
 * The design file's original 104px icon-only rail is still not used: labels
 * on hover make every destination a guess for anyone who does not already
 * know the icons.
 */
function Brand({ clubName }: { clubName: string }) {
  return (
    <div className="flex items-center gap-2.5 px-1.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[var(--color-accent-900)] text-[var(--color-accent-300)] shadow-[inset_0_0_0_1px_var(--color-accent-700)]">
        <UsersRoundIcon className="size-[18px]" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{clubName}</span>
        <span className="text-[11px] text-[var(--color-neutral-500)]">
          Club dashboard
        </span>
      </span>
    </div>
  );
}

/** Who is signed in, and what that account is. */
function Identity({ user }: { user: SessionUser }) {
  const name = user.full_name || user.username;
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-md)] bg-[color-mix(in_srgb,var(--color-surface)_70%,transparent)] p-3 shadow-[var(--shadow-sm)]">
      <div className="flex items-center gap-2.5">
        <span className="grid size-[30px] shrink-0 place-items-center rounded-full bg-[var(--color-accent-800)] text-[12px] text-[var(--color-accent-100)]">
          {initials(name)}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[13px]">{name}</span>
          <span className="truncate text-[11px] text-[var(--color-neutral-500)]">
            {user.email}
          </span>
        </span>
      </div>
      <span className="text-[11px] text-pretty text-[var(--color-neutral-500)]">
        {/* Said plainly because club logins are shared by a committee, and
            knowing the account is shared changes what you do with it. */}
        This is the club&rsquo;s shared login. Anything you do here is recorded
        against the club, not a person.
      </span>
    </div>
  );
}

function Rail({
  user,
  clubName,
  onNavigate,
}: {
  user: SessionUser;
  clubName: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex min-h-full flex-col gap-4 px-3.5 py-5">
      <Brand clubName={clubName} />
      <SidebarNav onNavigate={onNavigate} />
      <div className="mt-auto flex flex-col gap-2">
        <GateCard />
        <Identity user={user} />
      </div>
    </div>
  );
}

export function AppShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  // Closed by the nav items' own onNavigate rather than by an effect watching
  // the pathname: setting state from an effect costs an extra render pass and
  // fires on every route change, including ones the sheet was not open for.
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const clubName = user.full_name || user.username || "MyOtherApp";

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-[232px] shrink-0 shadow-[1px_0_0_var(--color-neutral-900)] lg:block">
        <div className="sticky top-0 min-h-dvh">
          <Rail user={user} clubName={clubName} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main
          className={cn(
            // overflow-x-clip rather than hidden: it contains children that
            // overrun without creating a scroll container, so sticky
            // positioning inside a page keeps working.
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
                  clubName={clubName}
                  onNavigate={() => setMobileOpen(false)}
                />
              </SheetContent>
            </Sheet>

            <span className="flex-1" />
            <UserMenu user={user} />
          </div>

          {children}
        </main>
      </div>

      {/* The rail is behind the menu on a phone, so this is the only route
          back to Overview for a keyboard or screen reader. */}
      <Link href="/" className="sr-only">
        Overview
      </Link>
    </div>
  );
}
