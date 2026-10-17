"use client";

import * as React from "react";
import { Loader2Icon, MapPinIcon, SearchIcon } from "lucide-react";
import { cn } from "@moa/ui";

import type { Place } from "../api";
import { usePlaceSearch } from "../use-place-search";

export interface VenuePickerProps
  extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "type" | "role" | "defaultValue" | "children" | "className"> {
  /** The venue as typed: the name people see, kept as it is unless a suggestion is picked. */
  value: string;
  onChange: (value: string) => void;
  /** A suggestion was picked. Its name is already passed to `onChange`; this hands over the point. */
  onPick: (place: Place) => void;
  /** For the wrapper; the field itself keeps the kit's `.input`. */
  className?: string;
}

/**
 * The venue field, with place suggestions as you type.
 *
 * An editable combobox in the ARIA 1.2 sense: the text stays the club's
 * own, the list only suggests. Up and down move through it (nothing is
 * highlighted until they do, so Enter never picks something unseen), Enter
 * or a click picks, Escape closes. Picking fills the name, which stays
 * editable — "Technopark Phase 1" can become "Technopark, Bhavani, 3rd
 * floor" — and hands the point to the form.
 *
 * Every attribute it is given that it does not use itself (id, name,
 * aria-describedby, aria-invalid, the ref) lands on the input, so a
 * FormControl can wrap it like any other field. When search is unreachable
 * it says so once and carries on as a plain text field.
 */
export function VenuePicker({ value, onChange, onPick, className, onKeyDown, onBlur, disabled, placeholder = "Search for the venue", "aria-describedby": describedBy, ...input }: VenuePickerProps) {
  const id = React.useId();
  const listId = `${id}-places`;
  const noteId = `${id}-note`;
  const optionId = (i: number) => `${id}-place-${i}`;
  // Only what the club typed is searched: not the saved name on load, nor the one a pick just filled in.
  const [typed, setTyped] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  // The highlight belongs to one answer; a new answer starts with none.
  const [cursor, setCursor] = React.useState<{ list: readonly Place[]; index: number }>({ list: [], index: -1 });
  const { places, status } = usePlaceSearch(value, typed && !disabled);
  const expanded = open && places.length > 0;
  const active = expanded && cursor.list === places ? cursor.index : -1;

  const pick = (place: Place) => {
    onChange(place.name);
    onPick(place);
    setTyped(false);
    setOpen(false);
  };

  const move = (step: 1 | -1) => {
    const n = places.length;
    const next = active < 0 ? (step > 0 ? 0 : n - 1) : (active + step + n) % n;
    setCursor({ list: places, index: next });
    setOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (places.length === 0) return;
      e.preventDefault();
      move(e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Enter") {
      const place = active >= 0 ? places[active] : undefined;
      // Without a highlighted suggestion Enter is left to the form.
      if (place) {
        e.preventDefault();
        pick(place);
      }
    } else if (e.key === "Escape" && expanded) {
      e.preventDefault();
      setOpen(false);
    }
  };

  const unreachable = status === "failed";
  const nothing = open && status === "done" && places.length === 0;
  const note = unreachable
    ? "Place search isn’t reachable right now, so type the venue as people would say it."
    : nothing
      ? "No places match. What you typed is kept as the venue."
      : expanded
        ? `${places.length} ${places.length === 1 ? "place" : "places"} found. Use the up and down arrows to choose.`
        : "";
  const noteShown = unreachable || nothing;

  return (
    <div className={className}>
      <div className="relative">
        <SearchIcon className="text-ink-3 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden="true" />
        <input
          {...input}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? optionId(active) : undefined}
          aria-describedby={[describedBy, noteShown ? noteId : null].filter(Boolean).join(" ") || undefined}
          autoComplete="off"
          spellCheck={false}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          className="input pr-9 pl-9"
          onChange={(e) => {
            onChange(e.target.value);
            setTyped(true);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          onBlur={(e) => {
            setOpen(false);
            onBlur?.(e);
          }}
        />
        {status === "searching" ? <Loader2Icon className="text-ink-3 pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin" aria-hidden="true" /> : null}
        <div hidden={!expanded} className="bg-surface border-line shadow-floating absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-[var(--radius-md)] border">
          <ul id={listId} role="listbox" aria-label="Places" className="scroll-thin max-h-72 overflow-y-auto p-1.5">
            {places.map((place, i) => {
              const detail = [place.street, place.city].filter(Boolean).join(" · ");
              const on = i === active;
              return (
                <li
                  key={place.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={on}
                  // Keeps focus in the field, so the click lands before the blur closes the list.
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseMove={() => {
                    if (!on) setCursor({ list: places, index: i });
                  }}
                  onClick={() => pick(place)}
                  className={cn("flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2", on ? "bg-sunken" : "hover:bg-sunken")}
                >
                  <MapPinIcon className={cn("mt-0.5 size-3.5 shrink-0", on ? "text-brand" : "text-ink-3")} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="text-ink block truncate text-[13px] font-medium">{place.name}</span>
                    {detail ? <span className="text-ink-3 block truncate text-[11.5px]">{detail}</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="border-line-soft text-ink-3 border-t px-3 py-1.5 text-[10.5px]">Places © OpenStreetMap contributors</p>
        </div>
      </div>
      <p id={noteId} aria-live="polite" className={noteShown ? "text-ink-3 mt-1.5 text-[12px]" : "sr-only"}>
        {note}
      </p>
    </div>
  );
}
