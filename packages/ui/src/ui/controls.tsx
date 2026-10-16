"use client";

import * as React from "react";
import { SearchIcon } from "lucide-react";

import { cn } from "../lib/cn";

/**
 * The small controls every list screen is built from, so each is written
 * once: the search pill, the native select, the choice card, the toolbar
 * row above a list. Buttons and chips live beside them in `button.tsx` and
 * `figure-kit.tsx`. A screen composes these; it never restyles them.
 */

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Fires on Enter and on blur, for screens that search on commit rather than on every keystroke. */
  onCommit?: (value: string) => void;
  placeholder?: string;
  /** What is being searched; the accessible name. */
  label: string;
  size?: "sm" | "md";
  className?: string;
  autoFocus?: boolean;
}

/** The search field: a pill on the sunken ground with an icon. Width comes from the caller. */
function SearchField({
  value,
  onChange,
  onCommit,
  placeholder,
  label,
  size = "md",
  className,
  autoFocus,
}: SearchFieldProps) {
  return (
    <label className={cn("search", size === "sm" && "search-sm", className)}>
      <SearchIcon aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit ? () => onCommit(value) : undefined}
        onKeyDown={
          onCommit
            ? (e) => (e.key === "Enter" ? onCommit(value) : null)
            : undefined
        }
        placeholder={placeholder ?? "Search"}
        aria-label={label}
        autoFocus={autoFocus}
      />
    </label>
  );
}

/** The native select, styled as the field with its own chevron. Options are the caller's. */
function NativeSelect({
  className,
  size = "md",
  ...props
}: Omit<React.ComponentProps<"select">, "size"> & { size?: "sm" | "md" }) {
  return (
    <select
      data-slot="select"
      className={cn("input", size === "sm" && "input-sm", className)}
      {...props}
    />
  );
}

export interface ChoiceCardProps {
  checked: boolean;
  onClick: () => void;
  /** The choice, in a few words. */
  title: React.ReactNode;
  /** What picking it means, in a line. */
  hint?: React.ReactNode;
  /** Something on the right: a count, a figure. */
  right?: React.ReactNode;
  disabled?: boolean;
  /** `admit` and `caution` tint the checked state; `brand` is the default. */
  tone?: "brand" | "admit" | "caution";
  className?: string;
}

const CHOICE_ON: Record<NonNullable<ChoiceCardProps["tone"]>, string> = {
  brand: "border-brand-line bg-brand-soft text-ink",
  admit: "border-admit-line bg-admit-soft text-ink",
  caution: "border-caution-line bg-caution-soft text-ink",
};

/** One of a few choices, as a card: a title, a hint, lit when picked. Put several in a `role="radiogroup"`. */
function ChoiceCard({
  checked,
  onClick,
  title,
  hint,
  right,
  disabled,
  tone = "brand",
  className,
}: ChoiceCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex items-center justify-between gap-3 rounded-[var(--radius-field)] border px-3 py-2 text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        checked ? CHOICE_ON[tone] : "border-line text-ink-2 hover:bg-sunken",
        className,
      )}
    >
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        {hint ? (
          <span className="text-ink-3 block text-[11.5px]">{hint}</span>
        ) : null}
      </span>
      {right ? (
        <span className="text-ink-3 shrink-0 font-mono text-[11px] tabular-nums">
          {right}
        </span>
      ) : null}
    </button>
  );
}

export interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}

/** A few exclusive choices in one 36px track; the picked one is raised. For two to four short labels. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "bg-sunken flex h-9 items-stretch gap-0.5 rounded-[var(--radius-field)] p-0.5 text-[12.5px]",
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 rounded-[calc(var(--radius-field)-2px)] px-3 whitespace-nowrap transition-colors",
            value === o.value
              ? "bg-surface text-ink shadow-card font-medium"
              : "text-ink-2 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** The row above a list inside a panel: chips on the left, search and sort on the right. */
function Toolbar({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "border-line-soft flex flex-wrap items-center gap-2 border-b px-4 py-3",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** The right-hand end of a toolbar. */
function ToolbarEnd({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("ml-auto flex flex-wrap items-center gap-2", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export {
  SearchField,
  NativeSelect,
  ChoiceCard,
  Segmented,
  Toolbar,
  ToolbarEnd,
};
