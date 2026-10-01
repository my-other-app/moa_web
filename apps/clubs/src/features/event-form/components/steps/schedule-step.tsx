"use client";

import { useFormContext } from "react-hook-form";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from "@moa/ui";

import type { EventFormValues } from "../../schemas";

export function ScheduleStep() {
  const form = useFormContext<EventFormValues>();

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="event_datetime"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Starts</FormLabel>
              <FormControl>
                {/* datetime-local keeps the value as a local wall-clock string,
                    which is what the backend's fromisoformat expects. */}
                <Input {...field} type="datetime-local" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="duration"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Duration (hours)</FormLabel>
              <FormControl>
                <Input {...field} type="number" min="0.5" step="0.5" inputMode="decimal" />
              </FormControl>
              <FormDescription>Use decimals for part-hours, e.g. 1.5</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="reg_startdate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Registration opens{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ""} type="datetime-local" />
              </FormControl>
              <FormDescription>Defaults to now if left blank.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="reg_enddate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Registration closes{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ""} type="datetime-local" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
