"use client";

import * as React from "react";
import { Loader2Icon, SaveIcon } from "lucide-react";
import { Button, Input, Label, Textarea, cn } from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { useUpdateEvent } from "../queries";
import type { AdminEventDetail } from "../schemas";

/**
 * Admin edit for any event.
 *
 * The backend has permitted this since admins were exempted from the event
 * ownership rule; the form was simply never built, so an admin could delete
 * an event but not fix a wrong date on it.
 *
 * Every field is sent, not just the changed ones: PUT /events/update assigns
 * what it receives, so an omitted field is cleared rather than left alone --
 * the same trap as the club update.
 */
function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

/** `2026-06-09T08:20:00` -> `2026-06-09T08:20`, which datetime-local needs. */
function toLocalInput(value: string | null | undefined): string {
  return value ? value.slice(0, 16) : "";
}

export function EventEditForm({ event }: { event: AdminEventDetail }) {
  const update = useUpdateEvent(event.id);

  const [form, setForm] = React.useState({
    name: event.name,
    about: event.about ?? "",
    location_name: event.location_name ?? "",
    event_datetime: toLocalInput(event.event_datetime),
    reg_enddate: toLocalInput(event.reg_enddate),
    max_participants: event.max_participants ?? "",
    contact_email: event.contact_email ?? "",
    contact_phone: event.contact_phone ?? "",
  });

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const valid = form.name.trim().length >= 3 && form.event_datetime !== "";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        update.mutate({
          ...form,
          // The API expects whole fields; an empty cap means "no limit".
          max_participants: form.max_participants === "" ? 0 : form.max_participants,
        });
      }}
      className="max-w-3xl space-y-6 pt-2"
      noValidate
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field id="event-name" label="Name">
            <Input
              id="event-name"
              value={form.name}
              onChange={(e) => set("name")(e.target.value)}
              disabled={update.isPending}
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field id="event-about" label="About">
            <Textarea
              id="event-about"
              rows={5}
              value={form.about}
              onChange={(e) => set("about")(e.target.value)}
              disabled={update.isPending}
            />
          </Field>
        </div>

        <Field id="event-when" label="Starts">
          <Input
            id="event-when"
            type="datetime-local"
            value={form.event_datetime}
            onChange={(e) => set("event_datetime")(e.target.value)}
            disabled={update.isPending}
          />
        </Field>

        <Field id="event-regend" label="Registration closes">
          <Input
            id="event-regend"
            type="datetime-local"
            value={form.reg_enddate}
            onChange={(e) => set("reg_enddate")(e.target.value)}
            disabled={update.isPending}
          />
        </Field>

        <Field id="event-where" label="Location">
          <Input
            id="event-where"
            value={form.location_name}
            onChange={(e) => set("location_name")(e.target.value)}
            disabled={update.isPending}
          />
        </Field>

        <Field id="event-cap" label="Maximum participants">
          <Input
            id="event-cap"
            type="number"
            min={0}
            value={String(form.max_participants)}
            onChange={(e) => set("max_participants")(e.target.value)}
            disabled={update.isPending}
          />
        </Field>

        <Field id="event-email" label="Contact email">
          <Input
            id="event-email"
            type="email"
            value={form.contact_email}
            onChange={(e) => set("contact_email")(e.target.value)}
            disabled={update.isPending}
          />
        </Field>

        <Field id="event-phone" label="Contact phone">
          <Input
            id="event-phone"
            inputMode="tel"
            value={form.contact_phone}
            onChange={(e) => set("contact_phone")(e.target.value)}
            disabled={update.isPending}
          />
        </Field>
      </div>

      <div className="flex items-center justify-end gap-3 border-t pt-4">
        <p className="text-muted-foreground mr-auto text-xs">
          Editing an event does not notify anyone who has registered.
        </p>
        <Button
          type="submit"
          disabled={!valid || update.isPending}
          className={cn(pressable)}
        >
          {update.isPending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
          Save changes
        </Button>
      </div>
    </form>
  );
}
