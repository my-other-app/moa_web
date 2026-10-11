"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@moa/ui";

import { EVENT_TABS } from "@/features/console";
import { useEventDetail } from "@/features/events";
import { navItems } from "./nav-items";

interface Crumb {
  label: string;
  href?: string;
}

/** The event's name, once it is known; its id meanwhile. */
function EventName({ id }: { id: number }) {
  const event = useEventDetail(id);
  return <>{event.data?.name ?? `Event ${id}`}</>;
}

/**
 * The trail in the top bar, read from the path rather than declared by each
 * page: the rail's label for the section, the event's name under it, and
 * the console's tab under that. Nothing to wire up, nothing to forget.
 */
export function Breadcrumbs() {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  const first = navItems.find((n) => (n.exact ? pathname === n.href : pathname.startsWith(n.href) && n.href !== "/"));
  const crumbs: (Crumb | { label: React.ReactNode; href?: string })[] = [];
  if (!first || first.href === "/") {
    crumbs.push({ label: "Dashboard" });
  } else {
    crumbs.push({ label: first.label, href: first.href });
    if (first.href === "/events" && parts[1] && parts[1] !== "new") {
      const id = Number(parts[1]);
      if (Number.isFinite(id)) {
        crumbs.push({ label: <EventName id={id} />, href: `/events/${id}` });
        const rest = `/${parts.slice(2).join("/")}`;
        const tab = rest === "/" ? null : EVENT_TABS.find((t) => t.path && rest.startsWith(t.path));
        if (tab) crumbs.push({ label: tab.label });
        else if (rest.startsWith("/design")) crumbs.push({ label: "Designs" });
      }
    } else if (parts[1] === "new") {
      crumbs.push({ label: "New" });
    } else if (parts[1] === "edit") {
      crumbs.push({ label: "Edit" });
    }
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
