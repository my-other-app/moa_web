"use client";

import { HandCoinsIcon } from "lucide-react";
import { useFormContext, useWatch } from "react-hook-form";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, Notice, Switch, cn } from "@moa/ui";

import { useIntegrationsOnServer } from "./queries";

export const EXTERNAL_PAYMENTS_LABEL = "Accept registrations paid outside MyOtherApp";
export const EXTERNAL_PAYMENTS_HELP = "Lets your own system, through the API, register people who paid you directly: at a counter, by UPI to the club, or in your college's portal.";

/**
 * "Accept registrations paid outside MyOtherApp", in the event form's places
 * and money. Saved with the event as `external_payments_allowed`.
 *
 * Off (the default), a paid event refuses registrations from the API: they
 * must pay through MyOtherApp's checkout. On, a registration from the club's
 * own system or a partner app may say it was paid elsewhere, and MyOtherApp
 * records it as such, never as money it holds or pays out.
 *
 * Shown only where it means something: the event's detail says it (an older
 * server doesn't, and then nothing is sent), the event is paid, and the club
 * can use the API (API access, or a partner app connected). One already on
 * always shows, so it can be turned off.
 */
export function ExternalPaymentsField() {
  const form = useFormContext<{ external_payments_allowed?: boolean; has_fee?: boolean; several_types?: boolean }>();
  const value = useWatch({ control: form.control, name: "external_payments_allowed" });
  const fee = useWatch({ control: form.control, name: "has_fee" });
  const several = useWatch({ control: form.control, name: "several_types" });
  const paid = Boolean(fee) || Boolean(several);
  const integrations = useIntegrationsOnServer(value !== undefined) === true;
  if (value === undefined) return null;
  if (!value && !(paid && integrations)) return null;
  return (
    <FormField
      control={form.control}
      name="external_payments_allowed"
      render={({ field }) => (
        <FormItem className={cn("rounded-xl border p-3.5 transition-colors", field.value ? "border-caution-line bg-caution-soft/40" : "border-line")}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className={cn("mt-0.5", field.value ? "text-caution" : "text-ink-3")}>
                <HandCoinsIcon className="size-4" />
              </span>
              <div>
                <FormLabel className="text-[13.5px]">{EXTERNAL_PAYMENTS_LABEL}</FormLabel>
                <FormDescription className="mt-0.5">{EXTERNAL_PAYMENTS_HELP}</FormDescription>
              </div>
            </div>
            <FormControl>
              <Switch checked={Boolean(field.value)} onCheckedChange={(next) => field.onChange(next)} aria-label={EXTERNAL_PAYMENTS_LABEL} />
            </FormControl>
          </div>
          {field.value ? (
            <Notice tone="caution" tag="Your money" className="mt-3">
              Your club collects this money itself. MyOtherApp doesn&apos;t see it, hold it, refund it or pay it out, and it isn&apos;t in your payouts. Check each payment on your
              side before your system registers someone as paid. People who sign up on MyOtherApp still pay through its checkout.
            </Notice>
          ) : null}
        </FormItem>
      )}
    />
  );
}
