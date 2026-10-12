"use client";

import { useFormContext } from "react-hook-form";
import { GiftIcon, IndianRupeeIcon, ShoppingBagIcon, TrophyIcon, UsersIcon } from "lucide-react";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Switch,
} from "@moa/ui";

import type { EventFormValues } from "../../schemas";

export function EntryStep() {
  const form = useFormContext<EventFormValues>();
  const hasFee = form.watch("has_fee");
  const hasPrize = form.watch("has_prize");

  return (
    <div className="grid gap-6">
      <FormField
        control={form.control}
        name="has_fee"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <FormLabel className="flex items-center gap-2">
                <IndianRupeeIcon className="size-4" /> Paid event
              </FormLabel>
              <FormDescription>
                Attendees pay through Razorpay before their ticket is issued.
              </FormDescription>
            </div>
            <FormControl>
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </FormControl>
          </FormItem>
        )}
      />

      {hasFee ? (
        <FormField
          control={form.control}
          name="reg_fee"
          render={({ field }) => (
            <FormItem className="animate-in fade-in-0 slide-in-from-top-1 motion-reduce:animate-none">
              <FormLabel>Registration fee (₹)</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ""} type="number" min="1" step="0.01" inputMode="decimal" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : null}

      <FormField
        control={form.control}
        name="has_prize"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <FormLabel className="flex items-center gap-2">
                <TrophyIcon className="size-4" /> Has a prize
              </FormLabel>
              <FormDescription>Shown on the event card to attract entrants.</FormDescription>
            </div>
            <FormControl>
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </FormControl>
          </FormItem>
        )}
      />

      {hasPrize ? (
        <FormField
          control={form.control}
          name="prize_amount"
          render={({ field }) => (
            <FormItem className="animate-in fade-in-0 slide-in-from-top-1 motion-reduce:animate-none">
              <FormLabel>Prize pool (₹)</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ""} type="number" min="1" step="0.01" inputMode="decimal" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : null}

      <FormField
        control={form.control}
        name="merch_enabled"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <FormLabel className="flex items-center gap-2">
                <ShoppingBagIcon className="size-4" /> Merchandise for sale
              </FormLabel>
              <FormDescription>Guests pick items when they register and pay once, with the ticket. A Merchandise tab appears on the event.</FormDescription>
            </div>
            <FormControl>
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </FormControl>
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="swag_enabled"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <FormLabel className="flex items-center gap-2">
                <GiftIcon className="size-4" /> Swag
              </FormLabel>
              <FormDescription>Free giveaways, set by who gets each and counted out at the door. A Swag tab appears on the event.</FormDescription>
            </div>
            <FormControl>
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </FormControl>
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="max_participants"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center gap-2">
              <UsersIcon className="size-4" /> Capacity{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ""} type="number" min="1" step="1" inputMode="numeric" />
            </FormControl>
            <FormDescription>Leave blank for unlimited places.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
