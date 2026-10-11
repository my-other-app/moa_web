"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@moa/ui";

import { isActive, navItems } from "./nav-items";

/**
 * The rail's items: an icon tile and a label, the current one lit.
 *
 * The active item carries three marks at once — a soft brand tint, the
 * brand colour on its text, and the tile filled — plus a 4px bar on the
 * leading edge that grows into place. Collapsed, only the tiles remain and
 * the label becomes the title.
 */
export function SidebarNav({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="px-3">
      <div className={cn("eyebrow px-2 pb-2.5 tracking-[0.14em]", collapsed && "hidden")}>Menu</div>
      <ul className="flex flex-col gap-0.5">
        {navItems.map((item) => {
          const on = isActive(pathname, item);
          return (
            <li key={item.href} className="relative">
              <span
                aria-hidden="true"
                className={cn("bg-brand absolute top-1/2 -left-3 w-1 -translate-y-1/2 rounded-r-full transition-[height] duration-200", on ? "h-5" : "h-0")}
              />
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={on ? "page" : undefined}
                title={item.label}
                className={cn(
                  "flex w-full items-center gap-3 rounded-[14px] px-2.5 py-[8px] text-left text-[13.5px] transition-colors duration-150",
                  on ? "bg-brand-soft text-brand font-semibold" : "text-ink-2 hover:bg-sunken hover:text-ink",
                  collapsed && "justify-center px-0"
                )}
              >
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-[10px] transition-colors duration-150", on ? "bg-brand text-brand-foreground" : "bg-raised text-ink-2")}>
                  <item.icon className="size-[17px]" />
                </span>
                <span className={cn("flex-1 truncate", collapsed && "hidden")}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
