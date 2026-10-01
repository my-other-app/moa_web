"use client";

import { useFieldArray, useFormContext } from "react-hook-form";
import { PlusIcon, Trash2Icon, UserRoundIcon } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Textarea,
  cn,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import type { EventFormValues } from "../../schemas";

export function DetailsStep() {
  const form = useFormContext<EventFormValues>();
  const speakers = useFieldArray({ control: form.control, name: "speakers" });

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 sm:grid-cols-3">
        <FormField
          control={form.control}
          name="contact_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Contact name</FormLabel>
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
              <FormLabel>Contact phone</FormLabel>
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
              <FormLabel>Contact email</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ""} type="email" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="event_guidelines"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              Guidelines <span className="text-muted-foreground font-normal">(optional)</span>
            </FormLabel>
            <FormControl>
              <Textarea
                {...field}
                value={field.value ?? ""}
                rows={4}
                placeholder="Rules, what to bring, eligibility…"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <FormLabel className="flex items-center gap-2">
              <UserRoundIcon className="size-4" /> Speakers
            </FormLabel>
            <FormDescription>Optional. Shown on the event page.</FormDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={pressable}
            onClick={() => speakers.append({ name: "", designation: "" })}
          >
            <PlusIcon /> Add speaker
          </Button>
        </div>

        {speakers.fields.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
            No speakers added.
          </p>
        ) : (
          <div className="grid gap-3">
            {speakers.fields.map((item, index) => (
              <Card
                key={item.id}
                className="animate-in fade-in-0 slide-in-from-top-1 motion-reduce:animate-none"
              >
                <CardContent className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
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
                        <FormLabel>Designation</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} placeholder="Head of Research" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn("text-destructive hover:text-destructive", pressable)}
                    onClick={() => speakers.remove(index)}
                    aria-label={`Remove speaker ${index + 1}`}
                  >
                    <Trash2Icon />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
