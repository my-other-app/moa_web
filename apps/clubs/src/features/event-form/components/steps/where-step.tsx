"use client";

import { useFormContext } from "react-hook-form";
import { GlobeIcon, MapPinIcon } from "lucide-react";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, Input, cn } from "@moa/ui";

import type { EventFormValues } from "../../schemas";

/** Where: one choice, then the one field it needs. */
export function WhereStep() {
  const form = useFormContext<EventFormValues>();
  const isOnline = form.watch("is_online");
  const pick = (online: boolean) => form.setValue("is_online", online, { shouldDirty: true, shouldValidate: true });
  return (
    <div className="grid gap-5">
      <FormField
        control={form.control}
        name="is_online"
        render={() => (
          <FormItem>
            <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="In person or online">
              <button type="button" onClick={() => pick(false)} aria-pressed={!isOnline} className={cn("flex items-start gap-3 rounded-xl border p-3 text-left transition-colors", !isOnline ? "border-brand-line bg-brand-soft" : "border-line hover:bg-sunken")}>
                <MapPinIcon className={cn("mt-0.5 size-4 shrink-0", !isOnline ? "text-brand" : "text-ink-3")} />
                <span>
                  <span className="text-ink block text-[13px] font-medium">In person</span>
                  <span className="text-ink-3 block text-[12px]">People come to a place. The gate and check-ins apply.</span>
                </span>
              </button>
              <button type="button" onClick={() => pick(true)} aria-pressed={isOnline} className={cn("flex items-start gap-3 rounded-xl border p-3 text-left transition-colors", isOnline ? "border-brand-line bg-brand-soft" : "border-line hover:bg-sunken")}>
                <GlobeIcon className={cn("mt-0.5 size-4 shrink-0", isOnline ? "text-brand" : "text-ink-3")} />
                <span>
                  <span className="text-ink block text-[13px] font-medium">Online</span>
                  <span className="text-ink-3 block text-[12px]">People join with a link, shown on their ticket.</span>
                </span>
              </button>
            </div>
          </FormItem>
        )}
      />
      {isOnline ? (
        <FormField
          control={form.control}
          name="url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Joining link</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ""} type="url" inputMode="url" placeholder="https://meet.google.com/…" />
              </FormControl>
              <FormDescription>Only people who registered see it.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : (
        <FormField
          control={form.control}
          name="location_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Venue</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ""} placeholder="Main Auditorium, Block C" />
              </FormControl>
              <FormDescription>As people would say it to a friend. The block and the room help more than the full address.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </div>
  );
}
