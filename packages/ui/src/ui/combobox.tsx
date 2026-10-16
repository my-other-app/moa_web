"use client";

import * as React from "react";
import { CheckIcon, ChevronDownIcon, SearchIcon, XIcon } from "lucide-react";

import { cn } from "../lib/cn";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export interface ComboboxOption<T extends string | number> {
  value: T;
  label: string;
  /** A line under the label: a city, a type. */
  hint?: string;
}

export interface ComboboxProps<T extends string | number> {
  value: T | null;
  options: readonly ComboboxOption<T>[];
  onChange: (value: T | null) => void;
  /** The accessible name of the field. */
  label: string;
  placeholder?: string;
  /** What the list says when nothing matches. */
  emptyText?: string;
  /** Whether the choice can be cleared. */
  clearable?: boolean;
  disabled?: boolean;
  loading?: boolean;
  id?: string;
  className?: string;
}

/**
 * A searchable select: a field that opens a list you can type into. For
 * a long list — colleges, organisations, cities — where a native select
 * would mean scrolling. Up and down move, Enter picks, Escape closes.
 */
function Combobox<T extends string | number>({ value, options, onChange, label, placeholder = "Choose…", emptyText = "Nothing matches", clearable = true, disabled, loading, id, className }: ComboboxProps<T>) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const listRef = React.useRef<HTMLUListElement>(null);
  const picked = options.find((o) => o.value === value) ?? null;
  const q = query.trim().toLowerCase();
  const shown = React.useMemo(() => (q ? options.filter((o) => o.label.toLowerCase().includes(q) || (o.hint ?? "").toLowerCase().includes(q)) : options).slice(0, 200), [options, q]);

  const pick = (v: T | null) => {
    onChange(v);
    setOpen(false);
    setQuery("");
  };

  React.useEffect(() => {
    setActive(0);
  }, [q, open]);

  React.useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(shown.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = shown[active];
      if (o) pick(o.value);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={(o) => (disabled ? null : setOpen(o))}>
      <div className={cn("relative", className)}>
        <PopoverTrigger asChild>
          <button type="button" id={id} role="combobox" aria-expanded={open} aria-label={label} disabled={disabled} className={cn("input flex items-center justify-between gap-2 text-left", !picked && "text-ink-3", clearable && picked && "pr-16")}>
            <span className="truncate">{loading ? "Loading…" : picked ? picked.label : placeholder}</span>
            <ChevronDownIcon className="text-ink-3 size-4 shrink-0" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        {clearable && picked && !disabled ? (
          <button type="button" aria-label={`Clear ${label}`} onClick={() => pick(null)} className="text-ink-3 hover:text-ink absolute top-1/2 right-9 grid size-6 -translate-y-1/2 place-items-center rounded-full">
            <XIcon className="size-3.5" />
          </button>
        ) : null}
      </div>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-64 p-1.5" onOpenAutoFocus={(e) => e.preventDefault()}>
        <label className="search search-sm">
          <SearchIcon aria-hidden="true" />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey} placeholder="Type to search" aria-label={`Search ${label}`} />
        </label>
        <ul ref={listRef} role="listbox" aria-label={label} className="scroll-thin mt-1.5 max-h-64 overflow-y-auto">
          {shown.length === 0 ? (
            <li className="text-ink-3 px-2.5 py-3 text-[12.5px]">{emptyText}</li>
          ) : (
            shown.map((o, i) => (
              <li key={String(o.value)} data-index={i} role="option" aria-selected={o.value === value} onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o.value)} className={cn("flex cursor-pointer items-center justify-between gap-2 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[13px]", i === active ? "bg-sunken text-ink" : "text-ink-2")}>
                <span className="min-w-0">
                  <span className="block truncate">{o.label}</span>
                  {o.hint ? <span className="text-ink-3 block truncate text-[11.5px]">{o.hint}</span> : null}
                </span>
                {o.value === value ? <CheckIcon className="text-brand size-4 shrink-0" aria-hidden="true" /> : null}
              </li>
            ))
          )}
          {options.length > 200 && shown.length === 200 ? <li className="text-ink-3 px-2.5 py-2 text-[11.5px]">Type more to narrow the list.</li> : null}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export { Combobox };
