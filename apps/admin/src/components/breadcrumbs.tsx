"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@moa/ui";

import { navItems } from "./nav-items";

/**
 * The trail in the top bar, read from the path: the rail's label for the
 * section, then the record under it. Nothing to wire up, nothing to forget.
 */
const NOUN: Record<string, string> = { users: "User", clubs: "Club", organizations: "Organisation", events: "Event", badges: "Badge" };

export function Breadcrumbs() {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  const first = navItems.find((n) => (n.exact ? pathname === n.href : pathname.startsWith(n.href) && n.href !== "/"));
  const crumbs: { label: string; href?: string }[] = [];
  if (!first || first.href === "/") {
    crumbs.push({ label: "Overview" });
  } else {
    crumbs.push({ label: first.label, href: first.href });
    if (parts[1]) crumbs.push({ label: parts[1] === "new" ? "New" : `${NOUN[parts[0]!] ?? "Record"} ${parts[1]}` });
  }

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
      <ol className="flex min-w-0 items-center gap-1.5 overflow-hidden">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={i} className="flex min-w-0 items-center gap-1.5">
              {c.href && !last ? (
                <Link href={c.href} className="text-ink-2 hover:text-ink truncate text-[12.5px]">
                  {c.label}
                </Link>
              ) : (
                <span className={cn("truncate text-[12.5px]", last ? "text-ink font-semibold" : "text-ink-2")} aria-current={last ? "page" : undefined}>
                  {c.label}
                </span>
              )}
              {!last ? <span className="text-ink-3 text-[11px]">/</span> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
