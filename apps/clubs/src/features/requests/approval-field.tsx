"use client";

import { UserCheckIcon } from "lucide-react";
import { useFormContext, useWatch } from "react-hook-form";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, Switch, cn } from "@moa/ui";

import { useAccess } from "@/features/access";

import { useRequestsOnServer } from "./queries";

/**
 * "Confirm each registration yourself", in the event form's places and
 * money. Saved with the event as `requires_approval`.
 *
 * Editing, it shows once the event's requests route answers (a bare 404
 * hides it) and the event's detail said what the setting is. Making an
 * event, it shows once the server is known to have requests (its access
 * caps name `decide_requests`), off until switched on. Elsewhere nothing is
 * shown and nothing is sent: the form leaves `requires_approval` unset, so
 * a backend without it never sees the field and a save never switches off
 * what it never read.
 */
export function ApprovalField({ eventId }: { eventId?: number }) {
  const form = useFormContext<{ requires_approval?: boolean }>();
  const value = useWatch({ control: form.control, name: "requires_approval" });
  const { can } = useAccess();
  const onServer = useRequestsOnServer(eventId);
  const shown = eventId ? onServer === true && value !== undefined : can.requests_known;
  if (!shown) return null;
  const wasOn = form.formState.defaultValues?.requires_approval === true;
  return (
    <FormField
      control={form.control}
      name="requires_approval"
      render={({ field }) => (
        <FormItem className={cn("rounded-xl border p-3.5 transition-colors", field.value ? "border-brand-line bg-brand-soft/40" : "border-line")}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className={cn("mt-0.5", field.value ? "text-brand" : "text-ink-3")}>
                <UserCheckIcon className="size-4" />
              </span>
              <div>
                <FormLabel className="text-[13.5px]">Confirm each registration yourself</FormLabel>
                <FormDescription className="mt-0.5">People who fill the form go on a waiting list until you confirm them. Their ticket goes out when you do.</FormDescription>
                {wasOn && !field.value ? (
                  <p className="text-ink-2 mt-1 text-[12px]">Once saved, new people register directly. Anyone already waiting stays on the list under Requests until you decide.</p>
                ) : null}
              </div>
            </div>
            <FormControl>
              <Switch checked={Boolean(field.value)} onCheckedChange={(next) => field.onChange(next)} aria-label="Confirm each registration yourself" />
            </FormControl>
          </div>
        </FormItem>
      )}
    />
  );
}
