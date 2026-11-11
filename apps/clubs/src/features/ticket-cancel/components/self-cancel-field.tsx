"use client";

import { TicketXIcon } from "lucide-react";
import { useFormContext, useWatch } from "react-hook-form";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, Switch, cn } from "@moa/ui";

import { SELF_CANCEL_HELP, SELF_CANCEL_LABEL } from "../schemas";

/**
 * "Attendees can give their ticket back", in the event form's places and
 * money. Saved with the event as `allow_self_cancel`.
 *
 * Shown only once the event's detail says what it is: an older server
 * doesn't send it, so the switch stays away and nothing is sent. A new event
 * is made with it on by the server; it is switched off later, from the
 * event's settings, by a club that would rather not.
 */
export function SelfCancelField() {
  const form = useFormContext<{ allow_self_cancel?: boolean }>();
  const value = useWatch({ control: form.control, name: "allow_self_cancel" });
  if (value === undefined) return null;
  return (
    <FormField
      control={form.control}
      name="allow_self_cancel"
      render={({ field }) => (
        <FormItem className={cn("rounded-xl border p-3.5 transition-colors", field.value ? "border-brand-line bg-brand-soft/40" : "border-line")}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className={cn("mt-0.5", field.value ? "text-brand" : "text-ink-3")}>
                <TicketXIcon className="size-4" />
              </span>
              <div>
                <FormLabel className="text-[13.5px]">{SELF_CANCEL_LABEL}</FormLabel>
                <FormDescription className="mt-0.5">{SELF_CANCEL_HELP}</FormDescription>
              </div>
            </div>
            <FormControl>
              <Switch checked={Boolean(field.value)} onCheckedChange={(next) => field.onChange(next)} aria-label={SELF_CANCEL_LABEL} />
            </FormControl>
          </div>
        </FormItem>
      )}
    />
  );
}
