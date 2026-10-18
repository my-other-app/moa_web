"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { formatNumber } from "@moa/app-kit";
import { cn } from "@moa/ui";

import { useOpenReportCount } from "@/features/reports";

import { isActive, navItems, type NavItem } from "./nav-items";

/** Counts that ask for something to be done, rather than state a fact: they take the brand. */
const PROMPTS = new Set<NavItem["badge"]>(["pendingClubs", "openReports"]);

/** What a count means, where its link says it aloud: "Reports, 3 open". */
const SPOKEN: Partial<Record<NonNullable<NavItem["badge"]>, string>> = { openReports: "open" };

/**
 * The rail's items, grouped: an icon tile and a label, the current one lit
 * three ways (a soft brand tint, the brand on its text, the tile filled) plus
 * a bar on the leading edge. Collapsed, only the tiles remain and the label
 * becomes the title. A count beside an item is a fact; the pending-clubs
 * and open-reports counts are prompts, so they alone take the brand. The
 * open-reports count is the rail's own: asked every minute and on focus,
 * and shown (as a dot when collapsed) only while there is something open.
 */
export function SidebarNav({
  badges,
  collapsed,
  onNavigate,
}: {
  badges?: Partial<Record<NonNullable<NavItem["badge"]>, string>>;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const openReports = useOpenReportCount().data ?? 0;
  const counts: Partial<Record<NonNullable<NavItem["badge"]>, string>> = {
    ...badges,
    ...(openReports > 0 ? { openReports: openReports > 99 ? "99+" : formatNumber(openReports) } : {}),
  };
  const sections: { label: string; items: NavItem[] }[] = [];
  for (const item of navItems) {
    if (item.group || sections.length === 0) sections.push({ label: item.group ?? "Menu", items: [] });
    sections[sections.length - 1]!.items.push(item);
  }

  return (
    <nav aria-label="Main" className="flex flex-col gap-4 px-3">
      {sections.map((section, s) => (
        <div key={section.label}>
          <div className={cn("eyebrow px-2 pb-2.5 tracking-[0.14em]", collapsed && "hidden")}>{section.label}</div>
          {collapsed && s > 0 && <div aria-hidden="true" className="bg-line-soft mx-2 mb-2 h-px" />}
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const on = isActive(pathname, item);
              const badge = item.badge ? counts[item.badge] : undefined;
              const prompt = PROMPTS.has(item.badge);
              const word = item.badge ? SPOKEN[item.badge] : undefined;
              return (
                <li key={item.href} className="relative">
                  <span aria-hidden="true" className={cn("bg-brand absolute top-1/2 -left-3 w-1 -translate-y-1/2 rounded-r-full transition-[height] duration-200", on ? "h-5" : "h-0")} />
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={on ? "page" : undefined}
                    aria-label={badge && word ? `${item.label}, ${badge} ${word}` : undefined}
                    title={item.label}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[14px] px-2.5 py-[8px] text-left text-[13.5px] transition-colors duration-150",
                      on ? "bg-brand-soft text-brand font-semibold" : "text-ink-2 hover:bg-sunken hover:text-ink",
                      collapsed && "justify-center px-0"
                    )}
                  >
                    <span className={cn("relative grid size-8 shrink-0 place-items-center rounded-[10px] transition-colors duration-150", on ? "bg-brand text-brand-foreground" : "bg-raised text-ink-2")}>
                      <item.icon className="size-[17px]" />
                      {badge && collapsed && prompt ? <span aria-hidden="true" className="bg-brand ring-surface absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2" /> : null}
                    </span>
                    <span className={cn("flex-1 truncate", collapsed && "hidden")}>{item.label}</span>
                    {badge && !collapsed ? (
                      <span className={cn("shrink-0 font-mono text-[11px] tabular-nums", prompt ? "text-brand" : "text-ink-3")}>
                        {badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
