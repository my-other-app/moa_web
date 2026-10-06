"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@moa/ui";

import { isActive, navItems } from "./nav-items";

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="grid gap-1 p-3" aria-label="Main">
      {navItems.map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              "focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-[3px]",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
            )}
          >
            {/* Active rail, scaled in so a change of page reads as movement
                rather than a sudden repaint. */}
            <span
              aria-hidden="true"
              className={cn(
                "bg-sidebar-primary absolute left-0 h-5 w-0.5 rounded-r-full transition-transform duration-200 motion-reduce:transition-none",
                active ? "scale-y-100" : "scale-y-0"
              )}
            />
            <item.icon
              className={cn(
                "size-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none",
                !active && "group-hover:scale-110"
              )}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
