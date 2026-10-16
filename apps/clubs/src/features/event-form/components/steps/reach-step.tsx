"use client";

import { useFormContext } from "react-hook-form";
import { Chip, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, Input, Skeleton, Textarea } from "@moa/ui";

import { useInterests } from "../../queries";
import type { EventFormValues } from "../../schemas";

/** Reach and rules: the topics that put it in front of followers, a label for the card, and the rules. */
export function ReachStep() {
  const form = useFormContext<EventFormValues>();
  const interests = useInterests();
  const selected = form.watch("interest_ids") ?? [];
  return (
    <div className="grid gap-6">
      <FormField
        control={form.control}
        name="interest_ids"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Topics</FormLabel>
            <FormDescription>Students who follow a topic see this event in their feed. Pick the two or three it is really about.</FormDescription>
            <FormControl>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {interests.isPending
                  ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-7 w-24 rounded-lg" />)
                  : interests.data?.map((it) => (
                      <Chip key={it.id} active={selected.includes(it.id)} onClick={() => field.onChange(selected.includes(it.id) ? selected.filter((id) => id !== it.id) : [...selected, it.id])}>
                        {it.name}
                      </Chip>
                    ))}
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="grid gap-5 sm:grid-cols-[280px_1fr]">
        <FormField
          control={form.control}
          name="event_tag"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Label on the card</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ""} placeholder="Beginner-friendly" maxLength={50} />
              </FormControl>
              <FormDescription>One or two words, like Flagship or Members only. Leave it blank for none.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="event_guidelines"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Rules and what to bring</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ""} rows={4} placeholder="Teams of up to four. Bring a laptop and a charger. College ID at the door." />
              </FormControl>
              <FormDescription>Shown under the description, and on the ticket email.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
