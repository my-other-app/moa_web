"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2Icon, SearchIcon, XIcon } from "lucide-react";
import { qk } from "@moa/api";
import { cn } from "@moa/ui";

// The api module, not the clubs barrel: the barrel reaches the club detail
// page, which renders the give-plan dialog that renders this picker.
import { fetchClubs } from "@/features/clubs/api";

export interface PickedClub {
  id: number;
  name: string;
}

/**
 * Find a club by name and pick it: for the screens that act on a club they
 * were not opened from (giving a plan from Subscriptions, filtering charges).
 * Asks the admin club list as the admin types, a handful at a time.
 */
export function ClubPicker({
  value,
  onChange,
  label = "Club",
  verifiedOnly = false,
  className,
}: {
  value: PickedClub | null;
  onChange: (club: PickedClub | null) => void;
  label?: string;
  /** Only approved clubs: a plan is given to a club that is on the platform. */
  verifiedOnly?: boolean;
  className?: string;
}) {
  const [text, setText] = React.useState("");
  const [search, setSearch] = React.useState("");
  const listId = React.useId();

  React.useEffect(() => {
    const t = window.setTimeout(() => setSearch(text.trim()), 250);
    return () => window.clearTimeout(t);
  }, [text]);

  const query = { search, isVerified: verifiedOnly ? true : undefined, offset: 0, limit: 8 };
  const results = useQuery({
    queryKey: [...qk.clubs.all, "picker", query],
    queryFn: () => fetchClubs(query),
    enabled: value === null && search.length >= 2,
    staleTime: 30_000,
  });

  if (value) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <span className="border-line bg-sunken text-ink inline-flex min-h-9 min-w-0 flex-1 items-center rounded-[var(--radius-field)] border px-3 text-[13px]">
          <span className="truncate">{value.name}</span>
        </span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange(null)} aria-label={`Clear ${label.toLowerCase()}: ${value.name}`}>
          <XIcon className="size-3.5" /> Change
        </button>
      </div>
    );
  }

  const items = (results.data?.items ?? []).slice(0, 8);
  const open = search.length >= 2;

  return (
    <div className={cn("relative flex flex-col gap-1.5", className)}>
      <label className="search">
        <SearchIcon aria-hidden="true" />
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a club's name"
          aria-label={label}
          aria-controls={open ? listId : undefined}
          autoComplete="off"
        />
      </label>
      {open ? (
        <ul id={listId} aria-label={`${label} matches`} className="border-line bg-surface shadow-card m-0 flex max-h-[220px] list-none flex-col overflow-y-auto rounded-[var(--radius-field)] border p-1">
          {results.isFetching && items.length === 0 ? (
            <li className="text-ink-3 flex items-center gap-2 px-2.5 py-2 text-[12.5px]">
              <Loader2Icon className="size-3.5 animate-spin" /> Looking…
            </li>
          ) : results.isError ? (
            <li className="text-refuse px-2.5 py-2 text-[12.5px]">Could not search the clubs.</li>
          ) : items.length === 0 ? (
            <li className="text-ink-3 px-2.5 py-2 text-[12.5px]">No {verifiedOnly ? "approved " : ""}club by that name.</li>
          ) : (
            items.map((club) => (
              <li key={club.id}>
                <button
                  type="button"
                  className="hover:bg-sunken text-ink flex w-full flex-col items-start rounded-[8px] px-2.5 py-1.5 text-left text-[13px]"
                  onClick={() => {
                    onChange({ id: club.id, name: club.name });
                    setText("");
                    setSearch("");
                  }}
                >
                  <span className="truncate">{club.name}</span>
                  {club.org?.name || club.location_name ? <span className="text-ink-3 truncate text-[11.5px]">{club.org?.name ?? club.location_name}</span> : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
