"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AwardIcon,
  BuildingIcon,
  CalendarDaysIcon,
  Loader2Icon,
  SearchIcon,
  UsersIcon,
  UsersRoundIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  cn,
} from "@moa/ui";

import { fetchUsers } from "@/features/users";
import { fetchClubs } from "@/features/clubs";
import { fetchEvents } from "@/features/events";
import { fetchOrgs } from "@/features/orgs";
import { fetchBadges } from "@/features/badges";

/**
 * Search across every section at once.
 *
 * The dashboard had a search box per page, so finding anything meant knowing
 * which section it lived in first -- the wrong question to have to answer
 * when someone reports a problem by name.
 *
 * It fans out to the existing list endpoints rather than adding a search
 * service: each already filters by name, five small parallel requests are
 * cheaper to build and keep correct than a new index that can fall behind.
 */
interface Hit {
  id: string;
  label: string;
  sublabel?: string;
  href: string;
  group: string;
  icon: React.ReactNode;
}

const LIMIT = 5;

async function search(term: string): Promise<Hit[]> {
  const q = term.trim();
  if (!q) return [];

  // Settled, not all: one failing section should still let the others show.
  const [users, clubs, events, orgs, badges] = await Promise.allSettled([
    fetchUsers({ search: q, offset: 0, limit: LIMIT }),
    fetchClubs({ search: q, offset: 0, limit: LIMIT }),
    fetchEvents({ search: q, offset: 0, limit: LIMIT }),
    fetchOrgs(),
    fetchBadges(),
  ]);

  const hits: Hit[] = [];
  const lower = q.toLowerCase();

  if (users.status === "fulfilled") {
    for (const user of users.value.items.slice(0, LIMIT)) {
      hits.push({
        id: `user-${user.id}`,
        label: user.full_name || user.username,
        sublabel: user.email ?? `@${user.username}`,
        href: `/users/${user.id}`,
        group: "Users",
        icon: <UsersIcon className="size-4" />,
      });
    }
  }
  if (clubs.status === "fulfilled") {
    for (const club of clubs.value.items.slice(0, LIMIT)) {
      hits.push({
        id: `club-${club.id}`,
        label: club.name,
        sublabel: club.is_verified ? club.location_name ?? "Verified" : "Pending approval",
        href: `/clubs/${club.id}`,
        group: "Clubs",
        icon: <UsersRoundIcon className="size-4" />,
      });
    }
  }
  if (events.status === "fulfilled") {
    for (const event of events.value.items.slice(0, LIMIT)) {
      hits.push({
        id: `event-${event.id}`,
        label: event.name,
        sublabel: event.club?.name ?? undefined,
        href: `/events/${event.id}`,
        group: "Events",
        icon: <CalendarDaysIcon className="size-4" />,
      });
    }
  }
  // Orgs and badges have no server-side search -- both endpoints return the
  // whole collection, so they are filtered here rather than left out.
  if (orgs.status === "fulfilled") {
    for (const org of orgs.value.filter((o) => o.name.toLowerCase().includes(lower)).slice(0, LIMIT)) {
      hits.push({
        id: `org-${org.id}`,
        label: org.name,
        sublabel: org.address ?? org.type ?? undefined,
        href: `/organizations/${org.id}`,
        group: "Organisations",
        icon: <BuildingIcon className="size-4" />,
      });
    }
  }
  if (badges.status === "fulfilled") {
    for (const badge of badges.value.filter((b) => b.name.toLowerCase().includes(lower)).slice(0, LIMIT)) {
      hits.push({
        id: `badge-${badge.id}`,
        label: badge.name,
        sublabel: badge.description ?? undefined,
        href: `/badges/${badge.id}`,
        group: "Badges",
        icon: <AwardIcon className="size-4" />,
      });
    }
  }

  return hits;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [term, setTerm] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [active, setActive] = React.useState(0);

  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(term), 200);
    return () => clearTimeout(id);
  }, [term]);

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { data: hits = [], isFetching } = useQuery({
    queryKey: ["command-palette", debounced],
    queryFn: () => search(debounced),
    enabled: debounced.trim().length >= 2,
    staleTime: 10_000,
  });

  // Clamped during render rather than reset from an effect: results change
  // on every keystroke, and an effect would paint one frame with the index
  // pointing past the end of the new list.
  const activeIndex = hits.length === 0 ? 0 : Math.min(active, hits.length - 1);

  function go(hit: Hit) {
    setOpen(false);
    setTerm("");
    router.push(hit.href);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(Math.min(activeIndex + 1, hits.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (event.key === "Enter" && hits[activeIndex]) {
      event.preventDefault();
      go(hits[activeIndex]!);
    }
  }

  let lastGroup = "";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:bg-accent/50 flex h-9 w-full max-w-xs items-center gap-2 rounded-md border px-3 text-sm transition-colors"
      >
        <SearchIcon className="size-4" />
        <span className="flex-1 text-left">Search everything…</span>
        <kbd className="bg-muted hidden rounded px-1.5 py-0.5 text-[10px] font-medium sm:inline">
          ⌘K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Search</DialogTitle>
            <DialogDescription>
              Find users, clubs, events, organisations and badges.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 border-b px-4">
            <SearchIcon className="text-muted-foreground size-4 shrink-0" />
            <input
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search users, clubs, events, organisations, badges…"
              aria-label="Search everything"
              className="h-12 w-full bg-transparent text-sm outline-none"
            />
            {isFetching ? (
              <Loader2Icon className="text-muted-foreground size-4 animate-spin" />
            ) : null}
          </div>

          <div className="max-h-[22rem] overflow-y-auto p-2">
            {debounced.trim().length < 2 ? (
              <p className="text-muted-foreground p-4 text-center text-sm">
                Type at least two characters.
              </p>
            ) : hits.length === 0 && !isFetching ? (
              <p className="text-muted-foreground p-4 text-center text-sm">
                Nothing matched “{debounced}”.
              </p>
            ) : (
              hits.map((hit, index) => {
                const header = hit.group !== lastGroup ? hit.group : null;
                lastGroup = hit.group;
                return (
                  <React.Fragment key={hit.id}>
                    {header ? (
                      <p className="text-muted-foreground px-2 pt-3 pb-1 text-xs font-medium">
                        {header}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => go(hit)}
                      onMouseEnter={() => setActive(index)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors",
                        index === activeIndex ? "bg-accent" : "hover:bg-accent/50"
                      )}
                    >
                      <span className="text-muted-foreground shrink-0">{hit.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{hit.label}</span>
                        {hit.sublabel ? (
                          <span className="text-muted-foreground block truncate text-xs">
                            {hit.sublabel}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </React.Fragment>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
