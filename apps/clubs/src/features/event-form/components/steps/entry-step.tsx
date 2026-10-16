"use client";

import { useFormContext } from "react-hook-form";
import { GiftIcon, IndianRupeeIcon, ShoppingBagIcon, TrophyIcon } from "lucide-react";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, Input, Switch, cn } from "@moa/ui";

import type { EventFormValues } from "../../schemas";

/**
 * Places and money: how many, what it costs, what is on offer. The two
 * modules (merchandise, swag) are named as what they add — a tab on the
 * event — so switching one on is a known cost, not a mystery.
 */
function Offer({ name, icon, title, hint, children }: { name: "has_fee" | "has_prize" | "merch_enabled" | "swag_enabled"; icon: React.ReactNode; title: string; hint: string; children?: React.ReactNode }) {
  const form = useFormContext<EventFormValues>();
  const on = form.watch(name);
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className={cn("rounded-xl border p-3.5 transition-colors", on ? "border-brand-line bg-brand-soft/40" : "border-line")}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className={cn("mt-0.5", on ? "text-brand" : "text-ink-3")}>{icon}</span>
              <div>
                <FormLabel className="text-[13.5px]">{title}</FormLabel>
                <FormDescription className="mt-0.5">{hint}</FormDescription>
              </div>
            </div>
            <FormControl>
              <Switch checked={field.value} onCheckedChange={field.onChange} aria-label={title} />
            </FormControl>
          </div>
          {on && children ? <div className="mt-3 pl-7">{children}</div> : null}
        </FormItem>
      )}
    />
  );
}

export function EntryStep() {
  const form = useFormContext<EventFormValues>();
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
        <Offer name="has_fee" icon={<IndianRupeeIcon className="size-4" />} title="Paid entry" hint="People pay through Razorpay before their ticket is issued.">
          <FormField
            control={form.control}
            name="reg_fee"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fee per person (₹)</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} type="number" min="1" step="1" inputMode="decimal" className="max-w-[160px]" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
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
        <Offer name="merch_enabled" icon={<ShoppingBagIcon className="size-4" />} title="Merchandise for sale" hint="People pick items when they sign up and pay once with the ticket. Adds a Merchandise tab." />
        <Offer name="swag_enabled" icon={<GiftIcon className="size-4" />} title="Swag to hand out" hint="Free things, counted out at the door by who gets what. Adds a Swag tab." />
      </div>
    </div>
  );
}
