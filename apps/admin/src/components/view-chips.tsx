"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BookmarkPlusIcon, XIcon } from "lucide-react";
import { cn, toast } from "@moa/ui";

/**
 * The v2 saved-view row: built-in views as chips, plus the admin's own.
 *
 * A view is a query string, exactly as in the v1 dropdown -- filters already
 * live in the URL, so a saved view is the same thing as a URL you could paste
 * to a colleague, and no new state is invented to hold one.
 *
 * Stored per browser. There is no user-preferences endpoint, and inventing a
 * table for this would be the wrong order to do things in; the cost is that
 * views do not follow an admin to another machine, which is worth saying out
 * loud rather than leaving them to discover.
 */
const STORAGE_PREFIX = "moa.view-chips.";

export interface ViewChip {
  /** Stable identifier; also the storage key for a saved one. */
  id: string;
  label: string;
  /** The query string this view applies, without the leading "?". */
  query: string;
}

function read(key: string): ViewChip[] {
  // Any of this throws or returns nothing in a private window, with site data
  // blocked, or during a thumbnail capture.
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is ViewChip =>
        !!v && typeof v.id === "string" && typeof v.label === "string" && typeof v.query === "string"
    );
  } catch {
    return [];
  }
}

/*
 * localStorage is external state, so it is read through useSyncExternalStore
 * rather than copied into component state by an effect. That avoids the
 * hydration mismatch (it does not exist during the server render) and the
 * extra render an effect costs, and keeps two tabs in step -- the browser's
 * own storage event is one of the subscriptions.
 *
 * getSnapshot must return a stable reference or React re-renders forever, so
 * the parsed value is cached and replaced only on a write.
 */
const EMPTY: ViewChip[] = [];
const cache = new Map<string, ViewChip[]>();
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

function snapshot(key: string): ViewChip[] {
  if (!cache.has(key)) cache.set(key, read(key));
  return cache.get(key)!;
}

function persist(key: string, next: ViewChip[]): boolean {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(next));
    cache.set(key, next);
    emit();
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether `query` is the view currently applied.
 *
 * Compared as parameter sets rather than as strings: `?provider=apple` and
 * `?provider=apple&page=1` are the same view, and so is the same pair written
 * in the other order. Keys the view does not mention are ignored, so paging
 * does not un-highlight the chip that got you there.
 */
function matches(current: URLSearchParams, query: string): boolean {
  const target = new URLSearchParams(query);
  const keys = new Set([...target.keys(), ...current.keys()]);
  for (const key of keys) {
    if (key === "page") continue;
    if ((target.get(key) ?? "") !== (current.get(key) ?? "")) return false;
  }
  return true;
}

export function ViewChips({
  /** Distinguishes one list's views from another's. */
  storageKey,
  /** Views that always exist, in the order the design shows them. */
  builtIn,
  /**
   * Names the view about to be saved, from the filters now applied. Returning
   * an empty string means "nothing worth saving" and the button stays off.
   */
  describeCurrent,
}: {
  storageKey: string;
  builtIn: ReadonlyArray<ViewChip>;
  describeCurrent: () => string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const saved = React.useSyncExternalStore(
    subscribe,
    () => snapshot(storageKey),
    () => EMPTY
  );

  const current = searchParams.toString();
  const label = describeCurrent();

  function apply(chip: ViewChip) {
    router.push(chip.query ? `${pathname}?${chip.query}` : pathname, { scroll: false });
  }

  function save() {
    if (!label) return;
    const next = [
      ...saved.filter((v) => v.label.toLowerCase() !== label.toLowerCase()),
      { id: `saved:${Date.now()}`, label, query: current },
    ];
    if (!persist(storageKey, next)) {
      toast.error("Could not save — this browser is blocking local storage");
      return;
    }
    toast.success(`Saved “${label}”`);
  }

  const chips = [...builtIn, ...saved];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[12px] text-ink-3">Saved views</span>

      {chips.map((chip) => {
        const active = matches(searchParams, chip.query);
        const removable = chip.id.startsWith("saved:");
        return (
          <span key={chip.id} className="inline-flex">
            <button
              type="button"
              aria-pressed={active}
              onClick={() => apply(chip)}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-[999px] border px-3 py-1.5 text-[12.5px] transition-colors",
                active
                  ? "border-brand bg-brand-soft text-brand"
                  : "border-line text-ink-2 hover:text-ink",
                removable && "rounded-r-none border-r-0 pr-2"
              )}
            >
              {chip.label}
            </button>
            {removable ? (
              <button
                type="button"
                aria-label={`Delete the view ${chip.label}`}
                onClick={() => persist(storageKey, saved.filter((v) => v.id !== chip.id))}
                className={cn(
                  "rounded-r-[999px] border border-l-0 pr-2.5 pl-1 text-ink-3 transition-colors hover:text-ink",
                  active
                    ? "border-brand bg-brand-soft"
                    : "border-line"
                )}
              >
                <XIcon className="size-3" />
              </button>
            ) : null}
          </span>
        );
      })}

      <button
        type="button"
        className="btn btn-ghost whitespace-nowrap text-[12.5px]"
        disabled={!label}
        title={label ? `Save as “${label}”` : "Filter the list first"}
        onClick={save}
      >
        <BookmarkPlusIcon className="size-4" />
        Save this view
      </button>
    </div>
  );
}
