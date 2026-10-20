"use client";

import { useFormContext } from "react-hook-form";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, Input, Textarea } from "@moa/ui";

import { AiFilledTag, aiFilledClass, useAiFilled } from "@/features/ai";
import { TopicPicker } from "@/features/topics";

import type { EventFormValues } from "../../schemas";

/**
 * Reach and rules: the interests that put it in front of followers (and,
 * through them, the topics it is listed under), a label for the card, and
 * the rules.
 */
export function ReachStep() {
  const form = useFormContext<EventFormValues>();
  const ai = useAiFilled();
  return (
    <div className="grid gap-6">
      <FormField
        control={form.control}
        name="interest_ids"
        render={({ field }) => (
          <FormItem className={aiFilledClass(ai.has("interest_ids"))}>
            <FormLabel>
              Interests
              <AiFilledTag on={ai.has("interest_ids")} />
            </FormLabel>
            <FormDescription>Students who follow an interest see this event in their feed, and it is listed under that interest&apos;s topic. Pick the two or three it is really about.</FormDescription>
            <FormControl>
              <TopicPicker
                value={field.value ?? []}
                onChange={field.onChange}
                label="Interests"
                className="pt-1"
                errorText="Interests could not load just now. The event keeps the ones it has; try again in a moment to change them."
              />
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
            <FormItem className={aiFilledClass(ai.has("event_guidelines"))}>
              <FormLabel>
                Rules and what to bring
                <AiFilledTag on={ai.has("event_guidelines")} />
              </FormLabel>
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
