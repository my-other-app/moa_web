"use client";

import Link from "next/link";
import { useFormContext, useWatch } from "react-hook-form";
import { ExternalLinkIcon, GiftIcon, IndianRupeeIcon, ShoppingBagIcon, TrophyIcon } from "lucide-react";
import { Checkbox, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, Input, Skeleton, Switch, cn } from "@moa/ui";

import { ItemChecklist, useClubStore } from "@/features/catalogue";
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
 *
 * Merchandise is the club's (the Merchandise page), so it is a check mark
 * here: ticked, the club's items are listed to tick the ones this event
 * sells. A few events at once can sell the same items from one stock.
 */
function Offer({ name, icon, title, hint, lock, control = "switch", wide, children }: { name: "has_fee" | "has_prize" | "merch_enabled" | "swag_enabled"; icon: React.ReactNode; title: string; hint: string; lock?: PlanLock | null; control?: "switch" | "check"; wide?: boolean; children?: React.ReactNode }) {
  const form = useFormContext<EventFormValues>();
  const on = form.watch(name);
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className={cn("rounded-xl border p-3.5 transition-colors", on ? "border-brand-line bg-brand-soft/40" : "border-line", on && wide && "lg:col-span-2")}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className={cn("mt-0.5", on ? "text-brand" : "text-ink-3")}>{icon}</span>
              <div>
                <span className="flex flex-wrap items-center gap-1.5">
                  <FormLabel className="text-[13.5px]">{title}</FormLabel>
                  <LockBadge lock={lock ?? null} />
                </span>
                <FormDescription className="mt-0.5">{hint}</FormDescription>
              </div>
            </div>
            <FormControl>
              {control === "check" ? (
                <Checkbox checked={field.value} onCheckedChange={(next) => (next === true && lock ? openUpgrade(lock) : field.onChange(next === true))} aria-label={title} className="size-5" />
              ) : (
                <Switch checked={field.value} onCheckedChange={(next) => (next && lock ? openUpgrade(lock) : field.onChange(next))} aria-label={title} />
              )}
            </FormControl>
          </div>
          {on && children ? <div className="mt-3 pl-7">{children}</div> : null}
        </FormItem>
      )}
    />
  );
}

/**
 * The club's items, to tick the ones this event sells. Links open in a new
 * tab so the form keeps what was typed; the list refreshes on coming back.
 */
function MerchPicks({ eventId }: { eventId?: number }) {
  const form = useFormContext<EventFormValues>();
  const ids = useWatch({ control: form.control, name: "store_item_ids" });
  const store = useClubStore({ refetchOnWindowFocus: true });
  const problem = form.formState.errors.store_item_ids?.message;
  const manage = (text: string) => (
    <Link href="/merchandise" target="_blank" rel="noopener" className="text-brand inline-flex items-center gap-1 font-medium hover:underline">
      {text} <ExternalLinkIcon className="size-3" aria-hidden="true" />
    </Link>
  );

  if (ids === undefined) {
    return (
      <p className="text-ink-3 text-[12.5px]">
        Could not read which items this event sells, so they stay as they are.{" "}
        {eventId ? (
          <Link href={`/events/${eventId}/store`} className="text-brand hover:underline">
            Choose them on its Merchandise tab
          </Link>
        ) : null}
      </p>
    );
  }
  return (
    <div className="grid gap-2.5">
      {store.isPending ? (
        <div aria-busy="true" aria-label="Loading your merchandise" className="grid gap-1.5">
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
        </div>
      ) : store.isError ? (
        <p className="text-ink-3 text-[12.5px]">Could not load your merchandise. {manage("Open Merchandise")}</p>
      ) : store.data.length === 0 ? (
        <p className="border-line bg-surface text-ink-2 rounded-xl border border-dashed px-3.5 py-3 text-[12.5px]">
          No merchandise yet. Add items under {manage("Merchandise")}
        </p>
      ) : (
        <>
          <ItemChecklist items={store.data} value={ids} onChange={(next) => form.setValue("store_item_ids", next, { shouldDirty: true })} eventId={eventId} />
          <p className="text-[12.5px]">{manage("Manage merchandise")}</p>
        </>
      )}
      {problem ? (
        <p role="alert" className="text-refuse text-[12.5px]">
          {problem}
        </p>
      ) : null}
    </div>
  );
}

export function EntryStep({ eventId }: { eventId?: number } = {}) {
  const form = useFormContext<EventFormValues>();
  // While editing, the event's own view of the plan: a grandfathered event is exempt.
  const plan = useEventPlan(eventId);
  const feeLock = plan.featureLock("tickets");
  return (
    <div className="grid gap-5">
      <FormField
        control={form.control}
        name="max_participants"
        render={({ field }) => (
          <FormItem className="sm:max-w-[320px]">
            <FormLabel>Places</FormLabel>
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
        {/* Ticked, it takes the full width to list the club's items to choose from. */}
        <Offer name="merch_enabled" control="check" wide icon={<ShoppingBagIcon className="size-4" />} title="Merchandise for sale" hint="Tick the club's items this event sells. People pick them when they sign up and pay once with the ticket. Adds a Merchandise tab." lock={plan.featureLock("merch")}>
          <MerchPicks eventId={eventId} />
        </Offer>
        <Offer name="swag_enabled" icon={<GiftIcon className="size-4" />} title="Swag to hand out" hint="Free things, counted out at the door by who gets what. Adds a Swag tab." lock={plan.featureLock("swag")} />
      </div>
    </div>
  );
}
