"use client";

import { useFieldArray, useFormContext } from "react-hook-form";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button, FormControl, FormField, FormItem, FormLabel, FormMessage, Input, cn } from "@moa/ui";

import { AiFilledTag, aiFilledClass, useAiFilled } from "@/features/ai";

import type { EventFormValues } from "../../schemas";

/**
 * The running order, on a new event: a time on the event's day, what
 * happens, who leads it. Saved to the event's agenda with the event; the
 * Agenda tab has the rest (end times, rooms, parallel blocks) from then on.
 * A drafted poster usually brings one, which is why it is here at all.
 */
export function AgendaField() {
  const form = useFormContext<EventFormValues>();
  const agenda = useFieldArray({ control: form.control, name: "agenda" });
  const ai = useAiFilled();
  const filled = ai.has("agenda");
  return (
    <div className={cn(aiFilledClass(filled))}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-ink m-0 text-[13.5px] font-medium">
            Running order <span className="text-ink-3 font-normal">· optional</span>
            <AiFilledTag on={filled} />
          </p>
          <p className="text-ink-3 m-0 text-[12px]">Saved to the event&apos;s Agenda tab with it. Add end times and rooms there later.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => agenda.append({ at: "", title: "", by: "" })}>
          <PlusIcon /> Add a block
        </Button>
      </div>
      {agenda.fields.length > 0 ? (
        <ul className="mt-3 grid gap-2" aria-label="Running order">
          {agenda.fields.map((item, index) => (
            <li key={item.id} className="border-line-soft bg-sunken grid gap-3 rounded-xl border p-3 sm:grid-cols-[112px_minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-end">
              <FormField
                control={form.control}
                name={`agenda.${index}.at`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time</FormLabel>
                    <FormControl>
                      <Input {...field} type="time" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`agenda.${index}.title`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>What happens</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Opening talk" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`agenda.${index}.by`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Led by · optional</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} placeholder="Dr. A. Kumar" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="button" variant="ghost" size="icon" className="text-refuse justify-self-end" onClick={() => agenda.remove(index)} aria-label={`Remove block ${index + 1}`}>
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
