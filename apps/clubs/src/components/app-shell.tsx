"use client";

import * as React from "react";
import Link from "next/link";
import { MenuIcon } from "lucide-react";
import { UserMenu } from "@moa/app-kit";
import type { SessionUser } from "@moa/auth";
import {
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@moa/ui";

import { SidebarNav } from "./sidebar-nav";

/**
 * Shell for the club dashboard.
 *
 * Replaces the design file's 104px icon-only rail (node 3:791) with the same
 * structure the admin dashboard uses: a labelled sidebar in the product's
 * charcoal, a header carrying identity and sign-out, and content on the light
 * surface. The old rail was faithful to the design and unusable without
 * already knowing the icons -- six circles, labels on hover only, and Overview
 * reachable solely by clicking the logo.
 *
 * Keeping both apps on one shell also means a fix to either lands in both,
 * which is the whole reason they share a component library.
 */
function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2 px-4 py-3.5">
      <span className="bg-sidebar-primary text-sidebar-primary-foreground grid size-7 shrink-0 place-items-center rounded-md text-xs font-bold">
        MO
      </span>
      <span className="bebas text-sidebar-foreground text-lg leading-none tracking-wide">
        CLUB
      </span>
    </Link>
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

  return (
    <div className="flex min-h-dvh">
      <aside className="bg-sidebar hidden w-60 shrink-0 border-r lg:flex lg:flex-col">
        <Wordmark />
        <SidebarNav />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background/80 sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-3 backdrop-blur-sm sm:px-4">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Open menu"
              >
                <MenuIcon />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="bg-sidebar w-64 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <Wordmark />
              <SidebarNav onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>

          <div className="flex-1" />
          <UserMenu user={user} />
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
