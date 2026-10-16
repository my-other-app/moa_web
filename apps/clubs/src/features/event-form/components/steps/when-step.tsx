"use client";

import * as React from "react";
import { useFormContext } from "react-hook-form";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, Input, cn } from "@moa/ui";

import { hoursBetween, joinLocal, spanLabel, splitLocal } from "../../readiness";
import type { EventFormValues } from "../../schemas";

/**
 * When: a day, a start and an end, the way people say it — not a datetime
 * picker and "duration in hours with decimals". The hours are derived and
 * read back as a sentence. Sign-up is open from now until the event starts
 * unless the organiser wants a window of their own.
 */
const field = "input h-9 w-full";

export function WhenStep() {
  const form = useFormContext<EventFormValues>();
  const start = form.watch("event_datetime") ?? "";
  const duration = form.watch("duration");
  const regStart = form.watch("reg_startdate") ?? "";
  const regEnd = form.watch("reg_enddate") ?? "";
  const { date, time } = splitLocal(start);
  const [custom, setCustom] = React.useState<boolean>(() => Boolean(regStart || regEnd));

  const endTime = React.useMemo(() => {
    if (!start || !duration) return "";
    const end = new Date(new Date(start).getTime() + Number(duration) * 3_600_000);
    if (Number.isNaN(end.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(end.getHours())}:${pad(end.getMinutes())}`;
  }, [start, duration]);

  const setStart = (d: string, t: string) => form.setValue("event_datetime", joinLocal(d, t), { shouldValidate: true, shouldDirty: true });
  const setEnd = (t: string) => {
    const h = hoursBetween(start, t);
    if (h !== null) form.setValue("duration", h, { shouldValidate: true, shouldDirty: true });
  };
  const sentence = spanLabel(start, duration);

  return (
    <div className="grid gap-6">
      <FormField
        control={form.control}
        name="event_datetime"
        render={() => (
          <FormItem>
            <div className="grid gap-3 sm:grid-cols-[1.3fr_1fr_1fr]">
              <div>
                <FormLabel htmlFor="ev-date">Day</FormLabel>
                <FormControl>
                  <input id="ev-date" type="date" className={cn(field, "mt-2")} value={date} onChange={(e) => setStart(e.target.value, time || "17:00")} />
                </FormControl>
              </div>
              <div>
                <FormLabel htmlFor="ev-start">Starts</FormLabel>
                <input id="ev-start" type="time" className={cn(field, "mt-2")} value={time} onChange={(e) => setStart(date, e.target.value)} />
              </div>
              <div>
                <FormLabel htmlFor="ev-end">Ends</FormLabel>
                <input id="ev-end" type="time" className={cn(field, "mt-2")} value={endTime} onChange={(e) => setEnd(e.target.value)} disabled={!start} />
              </div>
            </div>
            <FormDescription>{sentence ? `${sentence} · ${duration} ${Number(duration) === 1 ? "hour" : "hours"}` : "Pick the day first; the hours follow from the start and the end."}</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField control={form.control} name="duration" render={() => <FormItem><FormMessage /></FormItem>} />

      <div>
        <p className="text-ink text-[13.5px] font-medium">Sign-up</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              setCustom(false);
              form.setValue("reg_startdate", "", { shouldDirty: true });
              form.setValue("reg_enddate", "", { shouldDirty: true, shouldValidate: true });
            }}
            aria-pressed={!custom}
            className={cn("rounded-xl border p-3 text-left transition-colors", !custom ? "border-brand-line bg-brand-soft" : "border-line hover:bg-sunken")}
          >
            <span className="text-ink block text-[13px] font-medium">Open from now until it starts</span>
            <span className="text-ink-3 block text-[12px]">The usual. People can sign up right up to the start.</span>
          </button>
          <button type="button" onClick={() => setCustom(true)} aria-pressed={custom} className={cn("rounded-xl border p-3 text-left transition-colors", custom ? "border-brand-line bg-brand-soft" : "border-line hover:bg-sunken")}>
            <span className="text-ink block text-[13px] font-medium">A window of my own</span>
            <span className="text-ink-3 block text-[12px]">Opens later, or closes early so the list is final before the day.</span>
          </button>
        </div>
        {custom ? (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="reg_startdate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Opens <span className="text-ink-3 font-normal">· blank means now</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} type="datetime-local" />
                  </FormControl>
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
                    Closes <span className="text-ink-3 font-normal">· blank means at the start</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} type="datetime-local" max={start || undefined} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
