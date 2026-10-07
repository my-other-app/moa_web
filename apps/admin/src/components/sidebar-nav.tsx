"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@moa/ui";

import { isActive, navItems } from "./nav-items";

/**
 * The active item carries three marks at once: a tinted background, lime text
 * and a 3px inset bar on its leading edge. That is the design's signature and
 * all three are load-bearing -- the bar alone is easy to miss at 13.5px, and
 * the tint alone does not read as "here" on a surface this close to the page.
 */
export function SidebarNav({
  badges,
  onNavigate,
}: {
  badges?: Partial<Record<NonNullable<(typeof navItems)[number]["badge"]>, string>>;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {navItems.map((item) => {
        const active = isActive(pathname, item);
        const badge = item.badge ? badges?.[item.badge] : undefined;

        return (
          <div key={item.href} className="contents">
            {item.group ? (
              <span className="text-[10.5px] tracking-[0.1em] text-[var(--color-neutral-600)] uppercase px-2.5 pt-3 pb-1">
                {item.group}
              </span>
            ) : null}
            <Link
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
              {badge ? (
                <span
                  className={cn(
                    "text-[11px] shrink-0",
                    // The pending-club count is the one badge that is a
                    // prompt rather than a fact, so it alone takes the accent.
                    item.badge === "pendingClubs"
                      ? "text-[var(--color-accent-300)]"
                      : "text-[var(--color-neutral-500)]"
                  )}
                >
                  {badge}
                </span>
              ) : null}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
