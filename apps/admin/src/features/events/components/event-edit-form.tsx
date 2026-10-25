"use client";

import * as React from "react";
import { Loader2Icon, SaveIcon } from "lucide-react";
import { Button, Input, Label, Textarea, cn } from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { useEventCategories, useUpdateEvent } from "../queries";
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
 * the same trap as the club update. So the form sends the event as it is
 * (`fullPayload`) with the admin's edits laid over it: the category and the
 * length, which the endpoint requires (it answered 422 without them), the
 * fee, the prize, the questions, the interests and the speakers, which it
 * would otherwise reset.
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

/**
 * A datetime-local value back to what the API reads: the original when it
 * was not changed, else the new wall time with the original's offset (the
 * API sends times in India's, +05:30), so a save never moves an event.
 */
function toApiTime(input: string, original: string | null | undefined): string {
  if (!input) return "";
  if (original && toLocalInput(original) === input) return original;
  const offset = /([+-]\d{2}:\d{2}|Z)$/.exec(original ?? "")?.[1];
  return offset ? `${input}:00${offset}` : input;
}

type Raw = Record<string, unknown>;

const text = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);

/**
 * What the event holds that this form does not show, as the endpoint's
 * multipart fields: sent back unchanged so the save keeps it.
 */
export function unshownFields(event: AdminEventDetail): Raw {
  const raw = event as unknown as Raw;
  const list = (v: unknown): Raw[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Raw[]) : []);
  const interests = list(raw.interests).map((i) => Number(i.id)).filter((id) => Number.isFinite(id));
  return {
    reg_startdate: event.reg_startdate ?? undefined,
    is_online: String(Boolean(event.is_online)),
    has_fee: String(Boolean(event.has_fee)),
    reg_fee: event.has_fee ? (event.reg_fee ?? undefined) : undefined,
    has_prize: String(Boolean(event.has_prize)),
    prize_amount: event.has_prize ? (event.prize_amount ?? undefined) : undefined,
    contact_name: event.contact_name ?? undefined,
    url: event.url ?? undefined,
    event_guidelines: event.event_guidelines ?? undefined,
    event_tag: text(raw.event_tag),
    interest_ids: interests.length ? interests.join(",") : undefined,
    additional_details: JSON.stringify(
      list(raw.additional_details).map((q) => ({
        key: q.key,
        label: q.label,
        field_type: q.field_type,
        required: q.required ?? true,
        ...(Array.isArray(q.options) && q.options.length ? { options: q.options } : {}),
      }))
    ),
    // Each kept by its id (and its photo with it); a list without them would delete them.
    speakers: JSON.stringify(
      list(raw.speakers).map((sp) => ({
        id: sp.id,
        name: sp.name,
        designation: sp.designation ?? null,
        bio: sp.bio ?? null,
        link: sp.link ?? null,
      }))
    ),
  };
}

export function EventEditForm({ event }: { event: AdminEventDetail }) {
  const update = useUpdateEvent(event.id);
  const categories = useEventCategories();

  const [form, setForm] = React.useState({
    name: event.name,
    category_id: event.category?.id != null ? String(event.category.id) : "",
    duration: event.duration != null ? String(event.duration) : "",
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

  const hours = Number(form.duration);
  const valid =
    form.name.trim().length >= 3 &&
    form.event_datetime !== "" &&
    form.category_id !== "" &&
    form.duration !== "" &&
    Number.isFinite(hours) &&
    hours > 0;
  // The event's own category stays offered even if the list has not come yet, or lacks it.
  const own = event.category?.id != null ? { id: Number(event.category.id), name: event.category.name ?? "Current category" } : null;
  const listed = categories.data ?? [];
  const options = [...(own && !listed.some((c) => c.id === own.id) ? [own] : []), ...listed];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        update.mutate({
          ...unshownFields(event),
          ...form,
          event_datetime: toApiTime(form.event_datetime, event.event_datetime),
          reg_enddate: toApiTime(form.reg_enddate, event.reg_enddate),
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

        <Field id="event-category" label="Category">
          <select
            id="event-category"
            className="input"
            value={form.category_id}
            onChange={(e) => set("category_id")(e.target.value)}
            disabled={update.isPending}
          >
            {form.category_id === "" ? <option value="">Choose a category</option> : null}
            {options.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field id="event-duration" label="Length (hours)">
          <Input
            id="event-duration"
            type="number"
            min={0}
            step="0.5"
            value={form.duration}
            onChange={(e) => set("duration")(e.target.value)}
            disabled={update.isPending}
          />
        </Field>

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
