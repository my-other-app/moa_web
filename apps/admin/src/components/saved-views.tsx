"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BookmarkIcon, BookmarkPlusIcon, XIcon } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
  toast,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

/**
 * Named filter combinations, per list page.
 *
 * Filters already live in the query string, so a view is just a saved query
 * string -- no new state, and a saved view is the same thing as a URL you
 * could paste to someone.
 *
 * Stored per browser rather than per account: there is no endpoint for user
 * preferences, and inventing a table for this would be the wrong order to do
 * things in. The cost is that views do not follow an admin to another
 * machine, which is worth saying out loud rather than discovering.
 */
const STORAGE_PREFIX = "moa.saved-views.";

interface SavedView {
  name: string;
  query: string;
}

function read(key: string): SavedView[] {
  // Any of this can throw or return nothing in a private window, with site
  // data blocked, or during a thumbnail capture.
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => v?.name && typeof v.query === "string") : [];
  } catch {
    return [];
  }
}

function write(key: string, views: SavedView[]): boolean {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(views));
    return true;
  } catch {
    return false;
  }
}

/*
 * localStorage is external state, so it is read through useSyncExternalStore
 * rather than copied into component state by an effect. That avoids both the
 * hydration mismatch (it does not exist during the server render) and the
 * extra render pass an effect costs -- and it keeps two tabs in step, since
 * the browser's own storage event is one of the subscriptions.
 *
 * getSnapshot must return a stable reference or React re-renders forever, so
 * the parsed value is cached and only replaced on a write.
 */
const EMPTY: SavedView[] = [];
const cache = new Map<string, SavedView[]>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith(STORAGE_PREFIX)) {
      cache.delete(event.key.slice(STORAGE_PREFIX.length));
      emit();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function snapshot(key: string): SavedView[] {
  if (!cache.has(key)) cache.set(key, read(key));
  return cache.get(key)!;
}

function persist(key: string, next: SavedView[]): boolean {
  const ok = write(key, next);
  if (ok) {
    cache.set(key, next);
    emit();
  }
  return ok;
}

export function SavedViews({
  /** Distinguishes one list's views from another's. */
  storageKey,
  /** Built-in starting points, e.g. "Pending approval". */
  presets = [],
}: {
  storageKey: string;
  presets?: ReadonlyArray<SavedView>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const views = React.useSyncExternalStore(
    subscribe,
    () => snapshot(storageKey),
    () => EMPTY
  );

  const currentQuery = searchParams.toString();
  const hasFilters = currentQuery.length > 0;

  function apply(view: SavedView) {
    router.push(view.query ? `${pathname}?${view.query}` : pathname, { scroll: false });
  }

  function save() {
    const name = window.prompt("Name this view")?.trim();
    if (!name) return;

    const next = [
      ...views.filter((v) => v.name.toLowerCase() !== name.toLowerCase()),
      { name, query: currentQuery },
    ];
    if (!persist(storageKey, next)) {
      toast.error("Could not save — this browser is blocking local storage");
      return;
    }
    toast.success(`Saved “${name}”`);
  }

  function remove(name: string) {
    persist(storageKey, views.filter((v) => v.name !== name));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className={cn(pressable)}>
          <BookmarkIcon /> Views
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {presets.length > 0 ? (
          <>
            <DropdownMenuLabel>Quick filters</DropdownMenuLabel>
            {presets.map((preset) => (
              <DropdownMenuItem key={preset.name} onSelect={() => apply(preset)}>
                {preset.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        ) : null}

        <DropdownMenuLabel>Saved</DropdownMenuLabel>
        {views.length === 0 ? (
          <p className="text-muted-foreground px-2 py-1.5 text-xs">
            Filter the list, then save it here.
          </p>
        ) : (
          views.map((view) => (
            <DropdownMenuItem
              key={view.name}
              onSelect={() => apply(view)}
              className="justify-between gap-2"
            >
              <span className="truncate">{view.name}</span>
              <button
                type="button"
                aria-label={`Delete view ${view.name}`}
                onClick={(event) => {
                  // Without this the menu treats it as choosing the item and
                  // navigates to the view it is deleting.
                  event.preventDefault();
                  event.stopPropagation();
                  remove(view.name);
                }}
                className="text-muted-foreground hover:text-destructive shrink-0"
              >
                <XIcon className="size-3.5" />
              </button>
            </DropdownMenuItem>
          ))
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!hasFilters} onSelect={save}>
          <BookmarkPlusIcon />
          {hasFilters ? "Save current filters" : "No filters to save"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
