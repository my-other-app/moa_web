"use client";

import { Loader2Icon } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "@moa/ui";

import { useSetEventWinner } from "../queries";

/**
 * Records a placing for one registration.
 *
 * `is_won` and `position` have been columns on every registration since the
 * table was written and nothing in the product ever wrote them, so the three
 * badge metrics that read `position` -- events_won, runner_up_count and
 * podium_count -- were permanently zero and those badges unearnable. This is
 * the control that writes them.
 */
const NONE = "none";

/** The placings the badge metrics distinguish, plus a plain "placed". */
const PLACINGS = [
  { value: "1", label: "1st" },
  { value: "2", label: "2nd" },
  { value: "3", label: "3rd" },
  { value: "4", label: "4th" },
  { value: "5", label: "5th" },
] as const;

export function PlacingControl({
  eventId,
  registrationId,
  position,
  name,
}: {
  eventId: number;
  registrationId: string;
  position: number | null | undefined;
  name: string;
}) {
  const setWinner = useSetEventWinner(eventId);

  // A placing outside the fixed list still has to be representable, or
  // selecting it would silently rewrite someone's recorded position.
  const options =
    position && !PLACINGS.some((p) => p.value === String(position))
      ? [...PLACINGS, { value: String(position), label: `${position}th` }]
      : PLACINGS;

  return (
    <div className="flex items-center gap-1.5">
      {setWinner.isPending ? (
        <Loader2Icon className="text-muted-foreground size-3.5 animate-spin" />
      ) : null}
      <Select
        value={position ? String(position) : NONE}
        disabled={setWinner.isPending}
        onValueChange={(next) =>
          setWinner.mutate({
            registrationId,
            position: next === NONE ? null : Number(next),
          })
        }
      >
        <SelectTrigger
          size="sm"
          aria-label={`Placing for ${name}`}
          className={cn("w-[92px]", position ? "border-primary/40" : undefined)}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>No place</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
