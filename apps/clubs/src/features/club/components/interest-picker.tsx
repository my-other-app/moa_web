"use client";

import * as React from "react";
import { Skeleton, cn } from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { useInterestCategories } from "../queries";
import { interestEmoji, type ClubInterest } from "../schemas";

/**
 * "Select Areas Related to the Club" (node 368:393): a light grey panel with
 * one bold category heading per group and pill toggles beneath it.
 *
 * Categories come from GET /interests/list, which already returns them
 * grouped, so the grouping is the server's rather than something invented here
 * that would drift when an admin adds a category.
 */
function InterestPill({
  interest,
  selected,
  onToggle,
  disabled,
}: {
  interest: ClubInterest;
  selected: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  const emoji = interestEmoji(interest);

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "inline-flex items-center justify-center gap-1 rounded-full px-4 py-2 text-sm font-light transition-colors",
        "focus-visible:ring-ring/60 focus-visible:outline-none focus-visible:ring-[3px]",
        "disabled:pointer-events-none disabled:opacity-50",
        selected
          ? "bg-[var(--swatch-ink)] text-white"
          : "bg-white text-black hover:bg-[var(--swatch-lime)]",
        pressable
      )}
    >
      {emoji ? (
        <span aria-hidden="true" className="text-base leading-none">
          {emoji}
        </span>
      ) : null}
      {interest.name}
    </button>
  );
}

export function InterestPicker({
  value,
  onChange,
  disabled,
}: {
  value: number[];
  onChange: (next: number[]) => void;
  disabled?: boolean;
}) {
  const { data: categories, isPending, isError } = useInterestCategories();
  const selected = React.useMemo(() => new Set(value), [value]);

  function toggle(id: number) {
    onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  if (isPending) {
    return (
      <div className="space-y-9 rounded-2xl bg-[#f3f3f3] px-4 py-6">
        {Array.from({ length: 2 }).map((_, group) => (
          <div key={group} className="space-y-4">
            <Skeleton className="h-5 w-32" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-28 rounded-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError || !categories?.length) {
    return (
      <div className="rounded-2xl bg-[#f3f3f3] px-4 py-6">
        <p className="text-sm text-[var(--swatch-grey)]">
          Focus areas could not be loaded, so they are left unchanged when you
          save.
        </p>
      </div>
    );
  }

  return (
    <div className="flex max-h-[520px] flex-col gap-9 overflow-y-auto rounded-2xl bg-[#f3f3f3] px-4 py-2">
      {categories.map((category) => (
        <fieldset key={category.id} className="flex flex-col gap-4">
          <legend className="text-base font-bold text-black">{category.name}</legend>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
            {category.interests.map((interest) => (
              <InterestPill
                key={interest.id}
                interest={interest}
                selected={selected.has(interest.id)}
                onToggle={() => toggle(interest.id)}
                disabled={disabled}
              />
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
