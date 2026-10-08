"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@moa/ui";

import { isActive, navItems } from "./nav-items";

/**
 * The rail, on the v2 system.
 *
 * The active item carries three marks at once: a tinted background, lime text
 * and a 3px inset bar on its leading edge. That is the design's signature and
 * all three are load-bearing -- the bar alone is easy to miss at 13.5px, and
 * the tint alone does not read as "here" on a surface this close to the page.
 *
 * Identical to the admin app's, deliberately: the two dashboards are views of
 * one product, and a club member who has seen a screenshot of the admin side
 * should not have to relearn where things are.
 */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {navItems.map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-[7px] text-[13.5px] transition-colors",
              active
                ? "bg-[var(--color-accent-900)] text-[var(--color-accent-200)] shadow-[inset_3px_0_0_var(--color-accent)]"
                : "text-[var(--color-neutral-300)] hover:bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)]"
            )}
          >
            <item.icon className="size-[17px] shrink-0" />
            <span className="flex-1 truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
