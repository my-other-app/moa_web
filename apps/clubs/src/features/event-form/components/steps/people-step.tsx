"use client";

import { useFieldArray, useFormContext } from "react-hook-form";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, Input, InitialsAvatar } from "@moa/ui";

import type { EventFormValues } from "../../schemas";

/**
 * People: who is speaking, and who to ask. The contact is prefilled from
 * the club so it is rarely typed; a speaker is a name and a line, with a
 * photo if there is one.
 */
export function PeopleStep() {
  const form = useFormContext<EventFormValues>();
  const speakers = useFieldArray({ control: form.control, name: "speakers" });
  return (
    <div className="grid gap-6">
      <div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-ink text-[13.5px] font-medium">Speakers and mentors</p>
            <p className="text-ink-3 text-[12px]">Shown on the event page with their photo. Skip it for a members-only night.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => speakers.append({ name: "", designation: "" })}>
            <PlusIcon /> Add a speaker
          </Button>
        </div>
        {speakers.fields.length > 0 ? (
          <ul className="mt-3 grid gap-2">
            {speakers.fields.map((item, index) => {
              const name = form.watch(`speakers.${index}.name`) || "?";
              const photoUrl = form.watch(`speakers.${index}.photo_url`);
              return (
                <li key={item.id} className="border-line-soft bg-sunken grid items-end gap-3 rounded-xl border p-3 sm:grid-cols-[auto_1fr_1fr_auto]">
                  <label className="grid place-items-center" title="Photo">
                    {photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photoUrl} alt="" className="size-10 rounded-full object-cover" />
                    ) : (
                      <InitialsAvatar name={name} size={40} />
                    )}
                    <input type="file" accept="image/*" className="sr-only" onChange={(e) => form.setValue(`speakers.${index}.photoFile`, e.target.files?.[0], { shouldDirty: true })} aria-label={`Photo for speaker ${index + 1}`} />
                  </label>
                  <FormField
                    control={form.control}
                    name={`speakers.${index}.name`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Dr. A. Kumar" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`speakers.${index}.designation`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>One line</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} placeholder="Head of Research, IIT-M" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="button" variant="ghost" size="icon" className="text-refuse" onClick={() => speakers.remove(index)} aria-label={`Remove speaker ${index + 1}`}>
                    <Trash2Icon />
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      <div>
        <p className="text-ink text-[13.5px] font-medium">Who to ask</p>
        <p className="text-ink-3 text-[12px]">The Call organiser button on the event page. Filled from the club profile; change it for this event if someone else is running it.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="contact_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="contact_phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} inputMode="tel" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="contact_email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} type="email" />
                </FormControl>
                <FormDescription className="sr-only">Replies to event emails come here.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>
    </div>
  );
}
