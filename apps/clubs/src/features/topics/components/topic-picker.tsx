"use client";

import * as React from "react";
import { CheckIcon, XIcon } from "lucide-react";
import {
  TopicChips,
  TopicDot,
  filterTopicTree,
  interestEmoji,
  interestIndex,
  isTopicAware,
  topicColor,
  topicLabel,
  topicTint,
  topicsForInterests,
  type Topic,
  type TopicInterest,
} from "@moa/app-kit";
import { SearchField, Skeleton, cn } from "@moa/ui";

import { useTopicTree } from "../queries";

/**
 * The one way interests are picked: on sign-up, on the club profile and on
 * an event.
 *
 * Each topic is a section in its colour, its interests toggles beneath it.
 * Semantically a set of checkboxes: one fieldset per topic named by its
 * legend, a real checkbox inside each chip, so Tab walks them, Space
 * toggles and a screen reader hears "Robotics, checkbox, checked" inside
 * "Deep Tech". A search narrows every topic at once (Escape clears it); what
 * is picked stays above the list as chips that can be removed, with a count
 * read out as it changes.
 *
 * With the API before topics -- one category holding everything -- this is
 * simply one section.
 */
export interface TopicPickerProps {
  value: number[];
  onChange: (next: number[]) => void;
  disabled?: boolean;
  /** The picker's accessible name. */
  label?: string;
  /** Said as a hint until met; the form enforces it. */
  min?: number;
  /** Once reached, the rest are disabled until one is removed. */
  max?: number;
  /** What to say when the list cannot load: each form says what happens then. */
  errorText?: string;
  /** How tall the list of topics grows before it scrolls. */
  listMaxHeight?: number;
  className?: string;
  /** Passed through by FormControl, which points aria-describedby at the description and the error. */
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function InterestToggle({
  interest,
  color,
  checked,
  disabled,
  onToggle,
}: {
  interest: TopicInterest;
  color: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const emoji = interestEmoji(interest);
  return (
    <label
      data-slot="interest-toggle"
      data-checked={checked || undefined}
      className={cn(
        "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-chip)] border px-3 text-[12.5px] font-medium whitespace-nowrap transition-colors duration-150 select-none",
        "has-[:focus-visible]:outline-brand has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
        checked ? "text-ink" : "border-line bg-surface text-ink-2 hover:bg-sunken",
        disabled && "hover:bg-surface cursor-not-allowed opacity-50",
      )}
      style={checked ? topicTint(color, 16, 70) : undefined}
    >
      <input type="checkbox" className="sr-only" checked={checked} disabled={disabled} onChange={onToggle} />
      {checked ? <CheckIcon aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2.5} /> : null}
      {emoji ? (
        <span aria-hidden="true" className="text-[13px] leading-none">
          {emoji}
        </span>
      ) : null}
      {interest.name}
    </label>
  );
}

function TopicSection({
  topic,
  selected,
  atMax,
  disabled,
  showDescription,
  onToggle,
}: {
  topic: Topic;
  selected: ReadonlySet<number>;
  atMax: boolean;
  disabled: boolean;
  showDescription: boolean;
  onToggle: (id: number) => void;
}) {
  const color = topicColor(topic);
  const emoji = interestEmoji(topic);
  const picked = topic.interests.filter((i) => selected.has(i.id)).length;
  return (
    <fieldset data-slot="topic-section" className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-2 p-0">
        <span className="flex items-center gap-2">
          <TopicDot color={color} className="size-2.5" />
          {emoji ? (
            <span aria-hidden="true" className="text-[13px] leading-none">
              {emoji}
            </span>
          ) : null}
          <span className="text-ink text-[13px] font-semibold">{topicLabel(topic.name)}</span>
          {picked ? <span className="text-ink-3 text-[11.5px] tabular-nums">{picked} picked</span> : null}
        </span>
      </legend>
      {showDescription && topic.description ? <p className="text-ink-3 m-0 mb-2 -mt-1 text-[12px]">{topic.description}</p> : null}
      {topic.interests.length ? (
        <div className="flex flex-wrap gap-1.5">
          {topic.interests.map((interest) => {
            const checked = selected.has(interest.id);
            return (
              <InterestToggle
                key={interest.id}
                interest={interest}
                color={color}
                checked={checked}
                disabled={disabled || (atMax && !checked)}
                onToggle={() => onToggle(interest.id)}
              />
            );
          })}
        </div>
      ) : (
        <p className="text-ink-3 m-0 text-[12px]">Nothing under this topic yet.</p>
      )}
    </fieldset>
  );
}

export function TopicPicker({
  value,
  onChange,
  disabled = false,
  label = "Interests",
  min,
  max,
  errorText = "Interests could not load just now.",
  listMaxHeight = 420,
  className,
  id,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
}: TopicPickerProps) {
  const { data: tree, isPending, isError } = useTopicTree();
  const [query, setQuery] = React.useState("");
  const countId = React.useId();
  const selected = React.useMemo(() => new Set(value), [value]);
  const index = React.useMemo(() => interestIndex(tree ?? []), [tree]);
  const removeButtons = React.useRef(new Map<number, HTMLButtonElement>());
  const searchBox = React.useRef<HTMLDivElement>(null);
  const focusAfterRemove = React.useRef<number | "search" | null>(null);

  // Picked, in the order they were picked; an id the list no longer has is kept in the value but not shown.
  const picked = value.flatMap((v) => {
    const hit = index.get(v);
    return hit ? [hit] : [];
  });
  const atMax = max != null && picked.length >= max;
  const visible = React.useMemo(() => filterTopicTree(tree ?? [], query), [tree, query]);
  const shownUnder = tree && isTopicAware(tree) ? topicsForInterests(value, tree) : [];

  // After a chip is removed, focus goes to its neighbour (or the search), never to the page's top.
  React.useEffect(() => {
    const target = focusAfterRemove.current;
    if (target == null) return;
    focusAfterRemove.current = null;
    if (target === "search") searchBox.current?.querySelector("input")?.focus();
    else removeButtons.current.get(target)?.focus();
  }, [value]);

  function toggle(interestId: number) {
    if (disabled) return;
    if (selected.has(interestId)) onChange(value.filter((v) => v !== interestId));
    else if (!atMax) onChange([...value, interestId]);
  }

  function remove(interestId: number) {
    const shown = picked.map((p) => p.interest.id);
    const at = shown.indexOf(interestId);
    focusAfterRemove.current = shown[at + 1] ?? shown[at - 1] ?? "search";
    onChange(value.filter((v) => v !== interestId));
  }

  if (isPending) {
    return (
      <div className={cn("flex flex-col gap-3", className)} aria-busy="true" aria-label={label} role="group">
        <Skeleton className="h-8 w-full rounded-full" />
        {Array.from({ length: 2 }, (_, group) => (
          <div key={group} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-28" />
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-8 w-24 rounded-[var(--radius-chip)]" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p id={id} className={cn("text-ink-3 m-0 text-[12.5px]", className)}>
        {errorText}
      </p>
    );
  }

  const total = index.size;
  if (!tree.length || total === 0) {
    return (
      <p id={id} className={cn("text-ink-3 m-0 text-[12.5px]", className)}>
        No interests to pick from yet.
      </p>
    );
  }

  const count = picked.length === 0 ? "None picked" : max != null ? `${picked.length} of ${max} picked` : `${plural(picked.length, "interest", "interests")} picked`;

  return (
    <div
      id={id}
      role="group"
      aria-label={label}
      aria-describedby={[countId, describedBy].filter(Boolean).join(" ")}
      // aria-invalid is not allowed on a group; the error line is in aria-describedby instead.
      data-invalid={invalid || undefined}
      data-slot="topic-picker"
      className={cn("flex min-w-0 flex-col gap-3", className)}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div
          ref={searchBox}
          className="min-w-[180px] flex-1"
          onKeyDown={(e) => {
            if (e.key === "Escape" && query) {
              e.preventDefault();
              e.stopPropagation();
              setQuery("");
            }
          }}
        >
          <SearchField value={query} onChange={setQuery} label={`Search ${label.toLowerCase()}`} placeholder={tree.length > 1 ? "Search interests and topics" : "Search interests"} size="sm" />
        </div>
        <span id={countId} aria-live="polite" className="text-ink-3 text-[12px] tabular-nums">
          {count}
        </span>
      </div>

      {picked.length ? (
        <div className="flex flex-col gap-2">
          <ul aria-label={`Picked ${label.toLowerCase()}`} className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {picked.map(({ interest, topic }) => {
              const color = topicColor(topic);
              return (
                <li key={interest.id} className="m-0 p-0">
                  <span className="text-ink inline-flex h-7 items-center gap-1.5 rounded-full border pr-1 pl-2.5 text-[12px] font-medium" style={topicTint(color, 12, 45)}>
                    <TopicDot color={color} className="size-1.5" />
                    {interest.name}
                    <button
                      type="button"
                      ref={(el) => {
                        if (el) removeButtons.current.set(interest.id, el);
                        else removeButtons.current.delete(interest.id);
                      }}
                      onClick={() => remove(interest.id)}
                      disabled={disabled}
                      aria-label={`Remove ${interest.name}`}
                      className="text-ink-3 hover:text-ink hover:bg-sunken grid size-5 place-items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <XIcon aria-hidden="true" className="size-3" />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
          {shownUnder.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-ink-3 text-[12px]">Shows under</span>
              <TopicChips topics={shownUnder} size="xs" label="Shows under these topics" />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="scroll-thin -mx-1 flex flex-col gap-4 overflow-y-auto px-1 pt-0.5 pb-1" style={{ maxHeight: listMaxHeight }}>
        {visible.map((topic) => (
          <TopicSection key={topic.id} topic={topic} selected={selected} atMax={atMax} disabled={disabled} showDescription={!query} onToggle={toggle} />
        ))}
        {visible.length === 0 ? (
          <p className="text-ink-3 m-0 text-[12.5px]">
            Nothing matches “{query.trim()}”.{" "}
            <button type="button" className="text-brand hover:text-ink font-medium" onClick={() => setQuery("")}>
              Clear the search
            </button>
          </p>
        ) : null}
      </div>

      {atMax ? (
        <p className="text-ink-3 m-0 text-[12px]">That&apos;s the most you can pick ({max}). Remove one to pick another.</p>
      ) : min != null && picked.length < min ? (
        <p className="text-ink-3 m-0 text-[12px]">Pick at least {min}.</p>
      ) : null}
    </div>
  );
}
