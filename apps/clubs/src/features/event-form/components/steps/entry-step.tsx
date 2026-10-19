"use client";

import { useFormContext } from "react-hook-form";
import { GiftIcon, IndianRupeeIcon, ShoppingBagIcon, TrophyIcon } from "lucide-react";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, Input, Switch, cn } from "@moa/ui";

import { AiFilledTag, aiFilledClass, useAiFilled } from "@/features/ai";
import { PaymentsToNote } from "@/features/payments";
import { LockBadge, openUpgrade, useEventPlan, type PlanLock } from "@/features/plan";

import type { EventFormValues } from "../../schemas";

/**
 * Places and money: how many, what it costs, what is on offer. The two
 * modules (merchandise, swag) are named as what they add — a tab on the
 * event — so switching one on is a known cost, not a mystery.
 *
 * Paid entry, merchandise and swag are plan features. Locked, a switch that
 * is off opens the upgrade dialog instead of turning on; one already on can
 * still be turned off. An event the server grandfathers (`plan_grandfathered`
 * on its detail) has none of these locks: it keeps what it was made with.
 */
function Offer({ name, icon, title, hint, lock, children }: { name: "has_fee" | "has_prize" | "merch_enabled" | "swag_enabled"; icon: React.ReactNode; title: string; hint: string; lock?: PlanLock | null; children?: React.ReactNode }) {
  const form = useFormContext<EventFormValues>();
  const on = form.watch(name);
  const ai = useAiFilled();
  const filled = ai.has(name) || (name === "has_fee" && ai.has("reg_fee"));
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className={cn("rounded-xl border p-3.5 transition-colors", on ? "border-brand-line bg-brand-soft/40" : "border-line", aiFilledClass(filled))}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className={cn("mt-0.5", on ? "text-brand" : "text-ink-3")}>{icon}</span>
              <div>
                <span className="flex flex-wrap items-center gap-1.5">
                  <FormLabel className="text-[13.5px]">{title}</FormLabel>
                  <LockBadge lock={lock ?? null} />
                  <AiFilledTag on={filled} className="ml-0" />
                </span>
                <FormDescription className="mt-0.5">{hint}</FormDescription>
              </div>
            </div>
            <FormControl>
              <Switch checked={field.value} onCheckedChange={(next) => (next && lock ? openUpgrade(lock) : field.onChange(next))} aria-label={title} />
            </FormControl>
          </div>
          {on && children ? <div className="mt-3 pl-7">{children}</div> : null}
        </FormItem>
      )}
    />
  );
}

export function EntryStep({ eventId }: { eventId?: number } = {}) {
  const form = useFormContext<EventFormValues>();
  const ai = useAiFilled();
  // While editing, the event's own view of the plan: a grandfathered event is exempt.
  const plan = useEventPlan(eventId);
  const feeLock = plan.featureLock("tickets");
  return (
    <div className="grid gap-5">
      <FormField
        control={form.control}
        name="max_participants"
        render={({ field }) => (
          <FormItem className={cn("sm:max-w-[320px]", aiFilledClass(ai.has("max_participants")))}>
            <FormLabel>
              Places
              <AiFilledTag on={ai.has("max_participants")} />
            </FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ""} type="number" min="1" step="1" inputMode="numeric" placeholder="Unlimited" />
            </FormControl>
            <FormDescription>Sign-up closes by itself when they are taken. Leave it blank for no limit.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <Offer name="has_fee" icon={<IndianRupeeIcon className="size-4" />} title="Paid entry" hint="People pay through Razorpay before their ticket is issued." lock={feeLock}>
          <FormField
            control={form.control}
            name="reg_fee"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fee per person (₹)</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} type="number" min="1" step="1" inputMode="decimal" className="max-w-[160px]" disabled={feeLock !== null} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {/* Whose Razorpay the money lands in: the club's own, or MyOtherApp's. */}
          <PaymentsToNote eventId={eventId} />
        </Offer>
        <Offer name="has_prize" icon={<TrophyIcon className="size-4" />} title="A prize" hint="Shown on the card. Worth saying when it pulls people in.">
          <FormField
            control={form.control}
            name="prize_amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Prize pool (₹)</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} type="number" min="1" step="1" inputMode="decimal" className="max-w-[160px]" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </Offer>
        <Offer name="merch_enabled" icon={<ShoppingBagIcon className="size-4" />} title="Merchandise for sale" hint="People pick items when they sign up and pay once with the ticket. Adds a Merchandise tab." lock={plan.featureLock("merch")} />
        <Offer name="swag_enabled" icon={<GiftIcon className="size-4" />} title="Swag to hand out" hint="Free things, counted out at the door by who gets what. Adds a Swag tab." lock={plan.featureLock("swag")} />
      </div>
    </div>
  );
}
