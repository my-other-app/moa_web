"use client";

import { Button, InlineAlert, cn } from "@moa/ui";

import { AUDIENCES, type Audience } from "../schemas";

/** Which audience is being designed: everyone, or one group's own variant. */
export const ScopePicker = ({
  value,
  onChange,
  disabled,
}: {
  value: Audience;
  onChange: (v: Audience) => void;
  disabled?: boolean;
}) => (
  <div className="flex flex-wrap items-center gap-1.5">
    <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Designing</span>
    {AUDIENCES.map((a) => {
      const on = value === a.value;
      return (
        <button
          key={a.value}
          type="button"
          aria-pressed={on}
          disabled={disabled}
          onClick={() => onChange(a.value)}
          className={cn(
            "rounded-md border px-2.5 py-1.5 font-mono text-[11.5px] font-medium tracking-[0.05em] transition-colors disabled:opacity-50",
            on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"
          )}
        >
          {a.label.toUpperCase()}
        </button>
      );
    })}
  </div>
);

/** A variant is a full snapshot cloned from the default, not a diff. Make that legible. */
export const OverrideBanner = ({
  scopeName,
  isOwn,
  onReset,
  dirty,
}: {
  scopeName: string;
  isOwn: boolean;
  onReset: () => void;
  dirty: boolean;
}) => (
  <InlineAlert
    tone="warning"
    title={isOwn ? `${scopeName} has its own design` : `${scopeName} follows the event's design`}
    action={
      isOwn ? (
        <Button size="sm" variant="outline" onClick={onReset}>
          Reset to the event&apos;s design
        </Button>
      ) : undefined
    }
  >
    {isOwn
      ? "A complete copy, cloned when it was first customised. Later edits to the event's design do not reach it."
      : dirty
        ? "Saving now clones the whole design as a copy for this group — from then on the event's design no longer flows through."
        : "Moving anything here and saving clones the whole design as a copy for this group — from then on the event's design no longer flows through."}
  </InlineAlert>
);
