"use client";

import * as React from "react";
import { Switch, cn } from "@moa/ui";

/**
 * "Notify checked-in attendees", beside the button that opens the quiz or
 * launches a poll. The count is the room's, when the console already has it.
 */
export function NotifySwitch({
  checked,
  onCheckedChange,
  checkedIn,
  hint,
  className,
}: {
  checked: boolean;
  onCheckedChange: (on: boolean) => void;
  checkedIn?: number | null;
  /** When the push goes out, said under the label. */
  hint: string;
  className?: string;
}) {
  const id = React.useId();
  return (
    <label className={cn("flex cursor-pointer items-start gap-2.5", className)}>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint`}
        className="mt-0.5"
      />
      <span className="leading-tight">
        <span id={`${id}-label`} className="text-ink block text-[13px] font-medium">
          Notify checked-in attendees
          {checkedIn != null ? (
            <span className="text-ink-3 font-mono text-[11.5px] font-normal tabular-nums"> ({checkedIn})</span>
          ) : null}
        </span>
        <span id={`${id}-hint`} className="text-ink-3 mt-0.5 block text-[11.5px]">
          {hint}
        </span>
      </span>
    </label>
  );
}
