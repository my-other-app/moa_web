"use client";

import * as React from "react";
import { MoonIcon } from "lucide-react";
import { NativeSelect, cn } from "@moa/ui";

import { RELATIVE_PRESETS, istLabel, minutesLabel, triggerTime, type EventClock, type Trigger, type TriggerMode } from "../schemas";

/**
 * When a post goes out: on publish, at a date and time (India's), or
 * relative to the event (before it starts, before registrations close,
 * after it ends). Under the choice, when that lands for this event, and the
 * quiet-hours move when a relative time falls at night.
 */
const MODES: { mode: TriggerMode; label: string }[] = [
  { mode: "on_publish", label: "When the event is published" },
  { mode: "at", label: "At a date and time" },
  { mode: "before_start", label: "Before the event starts" },
  { mode: "before_reg_close", label: "Before registrations close" },
  { mode: "after_end", label: "After the event" },
];

/** "2026-11-15T10:00" in India's time, for a datetime-local input. */
export function toIstInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 16);
}

/** A datetime-local value read as India's time, back to an instant. */
export function fromIstInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  return new Date(`${value}:00+05:30`).toISOString();
}

/** A first value for a newly picked kind of time. */
export function defaultTrigger(mode: TriggerMode, now: Date): Trigger {
  switch (mode) {
    case "on_publish":
      return { mode };
    case "at": {
      // Tomorrow at 10 in the morning, India's time (04:30 UTC).
      const ist = new Date(now.getTime() + 330 * 60_000);
      return { mode, at: new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + 1, 4, 30)).toISOString() };
    }
    case "before_start":
      return { mode, minutes: 2 * 24 * 60 };
    case "before_reg_close":
      return { mode, minutes: 24 * 60 };
    case "after_end":
      return { mode, minutes: 24 * 60 };
  }
}

export function TriggerPicker({ value, onChange, clock, className }: { value: Trigger; onChange: (t: Trigger) => void; clock: EventClock; className?: string }) {
  const [now] = React.useState(() => new Date());
  const id = React.useId();
  const when = triggerTime(value, clock, now);
  const noRegClose = !clock.regClose;
  const presets = value.mode === "before_start" || value.mode === "before_reg_close" || value.mode === "after_end" ? RELATIVE_PRESETS[value.mode] : null;
  const minutes = "minutes" in value ? value.minutes : null;
  const live = clock.status && clock.status !== "draft";

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`${id}-mode`} className="eyebrow">
          When
        </label>
        <NativeSelect
          id={`${id}-mode`}
          size="sm"
          className="w-auto min-w-[220px]"
          value={value.mode}
          onChange={(e) => onChange(defaultTrigger(e.target.value as TriggerMode, now))}
          aria-label="When it goes out"
        >
          {MODES.map((m) => (
            <option key={m.mode} value={m.mode} disabled={m.mode === "before_reg_close" && noRegClose}>
              {m.label}
              {m.mode === "before_reg_close" && noRegClose ? " (no closing date)" : ""}
            </option>
          ))}
        </NativeSelect>
        {value.mode === "at" ? (
          <input
            type="datetime-local"
            className="input input-sm w-auto"
            aria-label="Date and time (India)"
            value={toIstInput(value.at)}
            onChange={(e) => {
              const at = fromIstInput(e.target.value);
              if (at) onChange({ mode: "at", at });
            }}
          />
        ) : null}
        {presets && minutes !== null ? (
          <NativeSelect
            size="sm"
            className="w-auto"
            aria-label="How long"
            value={String(minutes)}
            onChange={(e) => onChange({ ...value, minutes: Number(e.target.value) } as Trigger)}
          >
            {(presets.includes(minutes) ? presets : [...presets, minutes]).map((m) => (
              <option key={m} value={m}>
                {minutesLabel(m)} {value.mode === "after_end" ? "after" : "before"}
              </option>
            ))}
          </NativeSelect>
        ) : null}
      </div>
      <p className="text-ink-3 m-0 flex flex-wrap items-center gap-1.5 text-[12px]" aria-live="polite">
        {value.mode === "on_publish" ? (
          live ? (
            "The event is already live, so this goes out as soon as you schedule it."
          ) : (
            "Goes out the moment you publish the event."
          )
        ) : when.at ? (
          <>
            Goes out {istLabel(when.at)} IST
            {when.at.getTime() < now.getTime() - 60_000 ? <span className="text-refuse font-medium"> — that time has passed. Pick a later one.</span> : null}
          </>
        ) : value.mode === "before_reg_close" ? (
          "Set when registrations close under the event's Settings first."
        ) : (
          "Set the event's date first."
        )}
        {when.moved ? (
          <span className="text-ink-2 inline-flex items-center gap-1">
            <MoonIcon className="size-3" aria-hidden="true" /> Moved to 7 AM: nothing goes out between 11 PM and 7 AM.
          </span>
        ) : null}
      </p>
    </div>
  );
}
