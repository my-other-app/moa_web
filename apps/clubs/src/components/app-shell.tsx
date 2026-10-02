"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MenuIcon } from "lucide-react";
import { useLogout } from "@moa/app-kit";
import type { SessionUser } from "@moa/auth";
import {
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { Icon } from "./icon";
import { isActive, navItems, type NavItem } from "./nav-items";

/**
 * Shell from the design (node 3:791): a dark #2c333d canvas with an icon-only
 * rail down the left and the page content in a white panel rounded on its
 * left edge only, running full height.
 *
 * The rail is 104px with 60px circular buttons — lime for the current page,
 * grey otherwise. Labels appear on hover rather than inline, since the design
 * has no room for them; without that the rail would be unusable for anyone who
 * does not already know the icons.
 */
function RailButton({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={item.href}
          onClick={onNavigate}
          aria-label={item.label}
          aria-current={active ? "page" : undefined}
          className={cn(
            "grid size-[60px] place-items-center rounded-full transition-colors duration-200",
            "focus-visible:ring-ring/60 focus-visible:outline-none focus-visible:ring-[3px]",
            active
              ? "bg-[var(--swatch-lime)] text-black"
              : "bg-[var(--swatch-grey-light)] text-white hover:bg-white/80 hover:text-black",
            pressable
          )}
        >
          <Icon name={item.icon} />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

function Rail({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useLogout();

  async function onSignOut() {
    await logout.mutateAsync();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col items-center gap-[41px] py-8">
      {/* Overview has no icon in the design, so the logo carries it. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href="/"
            onClick={onNavigate}
            aria-label="Overview"
            className={cn(
              "bebas grid size-[60px] place-items-center rounded-full bg-white/10 text-lg leading-none tracking-wide text-white transition-colors hover:bg-white/20",
              pressable
            )}
          >
            MOA
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">Overview</TooltipContent>
      </Tooltip>

      <nav aria-label="Main" className="flex flex-col gap-[41px]">
        {navItems.map((item) => (
          <RailButton
            key={item.href}
            item={item}
            active={isActive(pathname, item)}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onSignOut}
            disabled={logout.isPending}
            aria-label="Sign out"
            className={cn(
              "grid size-[60px] place-items-center rounded-full bg-[var(--swatch-grey-light)] text-white transition-colors hover:bg-white/80 hover:text-black",
              "focus-visible:ring-ring/60 focus-visible:outline-none focus-visible:ring-[3px]",
              "disabled:opacity-60",
              pressable
            )}
          >
            <Icon name="log-out-03" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Sign out</TooltipContent>
      </Tooltip>
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
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const pathname = usePathname();

  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="bg-[var(--swatch-ink)] flex min-h-dvh">
      {/* Rail: fixed 104px from lg up, a sheet below that. */}
      <aside className="hidden w-[104px] shrink-0 lg:block">
        <Rail />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* The white panel: rounded on the left edge only, as in the design. */}
        <div className="bg-card text-card-foreground min-h-dvh flex-1 rounded-l-2xl px-4 py-6 sm:px-8 lg:px-[31px] lg:py-[42px]">
          <div className="mb-4 flex items-center gap-2 lg:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open menu">
                  <MenuIcon />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="bg-[var(--swatch-ink)] w-[104px] border-none p-0"
              >
                <SheetHeader className="sr-only">
                  <SheetTitle>Navigation</SheetTitle>
                </SheetHeader>
                <Rail onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
            <span className="text-muted-foreground truncate text-sm">
              {user.full_name ?? user.username}
            </span>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
