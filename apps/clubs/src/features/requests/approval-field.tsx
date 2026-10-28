"use client";

import { FlameIcon, UserCheckIcon } from "lucide-react";
import { useFormContext, useWatch } from "react-hook-form";
import { formatNumber } from "@moa/app-kit";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, Notice, Switch, cn } from "@moa/ui";

import { useAccess } from "@/features/access";

import { useRequestCounts, useRequestsOnServer } from "./queries";

/**
 * "Review registrations before sending tickets", in the event form's places
 * and money. Saved with the event as `requires_approval`.
 *
 * Editing, it shows once the event's requests route answers (a bare 404
 * hides it) and the event's detail said what the setting is. Making an
 * event, it shows once the server is known to have requests (its access
 * caps name `decide_requests`), off until switched on. Elsewhere nothing is
 * shown and nothing is sent: the form leaves `requires_approval` unset, so
 * a backend without it never sees the field and a save never switches off
 * what it never read.
 *
 * Switching it on for an event says what happens to its waiting list (the
 * server moves everyone in line into Review). Switching it off on an event
 * with registrations under review says how many: they stay under review
 * until the club confirms or declines them.
 */
export const REVIEW_LABEL = "Review registrations before sending tickets";
export const REVIEW_HELP =
  "Everyone who registers gets a 'Thanks for registering' email. You confirm or decline each registration in the Review tab, and confirmed people get their ticket by email.";
export const REVIEW_ON_NOTE =
  "Anyone on this event's waiting list moves into Review as a registration under review, and gets the 'Thanks for registering' email once.";

export function ApprovalField({ eventId }: { eventId?: number }) {
  const form = useFormContext<{ requires_approval?: boolean }>();
  const value = useWatch({ control: form.control, name: "requires_approval" });
  const { can } = useAccess();
  const onServer = useRequestsOnServer(eventId);
  const counts = useRequestCounts(eventId ?? 0, Boolean(eventId));
  const shown = eventId ? onServer === true && value !== undefined : can.requests_known;
  if (!shown) return null;
  const wasOn = form.formState.defaultValues?.requires_approval === true;
  const underReview = counts.data?.counts.pending ?? 0;
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
                <FormLabel className="text-[13.5px]">{REVIEW_LABEL}</FormLabel>
                <FormDescription className="mt-0.5">{REVIEW_HELP}</FormDescription>
              </div>
            </div>
            <FormControl>
              <Switch checked={Boolean(field.value)} onCheckedChange={(next) => field.onChange(next)} aria-label={REVIEW_LABEL} />
            </FormControl>
          </div>
          {eventId && !wasOn && field.value ? (
            <p className="text-ink-2 mt-2 text-[12px]">{REVIEW_ON_NOTE}</p>
          ) : null}
          {wasOn && !field.value ? (
            underReview > 0 ? (
              <Notice tone="caution" tag="Under review" className="mt-2">
                {underReview === 1
                  ? "1 registration is under review. It stays under review until you confirm or decline it; new people get their ticket straight away."
                  : `${formatNumber(underReview)} registrations are under review. They stay under review until you confirm or decline them; new people get their ticket straight away.`}
              </Notice>
            ) : (
              <p className="text-ink-2 mt-1 text-[12px]">Once saved, new people get their ticket straight away. No registrations are under review now.</p>
            )
          ) : null}
        </FormItem>
      )}
    />
  );
}

/**
 * "High demand" on the event's public page: a tag, never a number (the
 * public pages show no request counts). Saved as `high_demand_label`.
 *
 * Shown only once the event's detail says what it is: an older server
 * doesn't send it, so the switch stays away and nothing is sent. A new
 * event starts without it; it is switched on later, under Settings, once
 * the demand is there.
 */
export function HighDemandField() {
  const form = useFormContext<{ high_demand_label?: boolean }>();
  const value = useWatch({ control: form.control, name: "high_demand_label" });
  if (value === undefined) return null;
  return (
    <FormField
      control={form.control}
      name="high_demand_label"
      render={({ field }) => (
        <FormItem className={cn("rounded-xl border p-3.5 transition-colors", field.value ? "border-brand-line bg-brand-soft/40" : "border-line")}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className={cn("mt-0.5", field.value ? "text-brand" : "text-ink-3")}>
                <FlameIcon className="size-4" />
              </span>
              <div>
                <FormLabel className="text-[13.5px]">&ldquo;High demand&rdquo; label</FormLabel>
                <FormDescription className="mt-0.5">Shows a &ldquo;High demand&rdquo; tag on the event&apos;s public page. No numbers are shown.</FormDescription>
              </div>
            </div>
            <FormControl>
              <Switch checked={Boolean(field.value)} onCheckedChange={(next) => field.onChange(next)} aria-label="High demand label" />
            </FormControl>
          </div>
        </FormItem>
      )}
    />
  );
}
