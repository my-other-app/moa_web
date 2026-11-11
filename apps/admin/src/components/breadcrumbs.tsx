"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@moa/ui";

import { navItems } from "./nav-items";

/**
 * The trail in the top bar, read from the path: the rail's label for the
 * section, then the record under it. Nothing to wire up, nothing to forget.
 */
const NOUN: Record<string, string> = { users: "User", clubs: "Club", organizations: "Organisation", events: "Event", badges: "Badge", support: "Case", leads: "Lead", speakers: "Speaker" };
/** A section's own pages under its path, named rather than read as a record: /speakers/duplicates. */
const PAGE: Record<string, string> = { new: "New", duplicates: "Merge queue" };

export function Breadcrumbs() {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  const first = navItems.find((n) => (n.exact ? pathname === n.href : pathname.startsWith(n.href) && n.href !== "/"));
  const crumbs: { label: string; href?: string }[] = [];
  if (!first || first.href === "/") {
    crumbs.push({ label: "Overview" });
  } else {
    crumbs.push({ label: first.label, href: first.href });
    // The record is the segment after the section's own path: /users/12, /teamwork/support/1042.
    const base = first.href.split("/").filter(Boolean);
    const record = parts[base.length];
    if (record) crumbs.push({ label: PAGE[record] ?? `${NOUN[base.at(-1)!] ?? "Record"} ${record}` });
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
