"use client";

import { useFormContext } from "react-hook-form";
import { GlobeIcon, MapPinIcon } from "lucide-react";
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

export function PlaceStep() {
  const form = useFormContext<EventFormValues>();
  const isOnline = form.watch("is_online");

  return (
    <div className="grid gap-6">
      <FormField
        control={form.control}
        name="is_online"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <FormLabel className="flex items-center gap-2">
                {isOnline ? <GlobeIcon className="size-4" /> : <MapPinIcon className="size-4" />}
                Online event
              </FormLabel>
              <FormDescription>
                {isOnline
                  ? "Attendees join with a link instead of a venue."
                  : "Attendees come to a physical venue."}
              </FormDescription>
            </div>
            <FormControl>
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </FormControl>
          </FormItem>
        )}
      />

      {/* Only the relevant field is shown. Both are validated conditionally in
          the schema, so an online event cannot ship without a link. */}
      {isOnline ? (
        <FormField
          control={form.control}
          name="url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Joining link</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={field.value ?? ""}
                  type="url"
                  inputMode="url"
                  placeholder="https://meet.google.com/…"
                />
              </FormControl>
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
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </div>
  );
}
