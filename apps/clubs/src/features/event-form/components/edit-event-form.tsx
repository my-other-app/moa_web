"use client";

import { AlertTriangleIcon } from "lucide-react";
import { ApiError } from "@moa/api";
import { posterSizes } from "@moa/app-kit";
import { Card, CardContent, Skeleton } from "@moa/ui";

import { useEventOffers } from "@/features/catalogue";
import { partnersSupported } from "@/features/event-partners";
import { useTicketTypes } from "@/features/ticketing/queries";
import { formDefaultsFrom } from "@/features/ticketing/schemas";

import { useEvent } from "../queries";
import { eventDetailToFormValues } from "../mapper";
import { EventForm, type EventFormContext } from "./event-form";

/** What the detail payload says about the event beyond the fields the form edits. */
function contextOf(raw: unknown): EventFormContext {
  const d = (raw ?? {}) as Record<string, unknown>;
  const poster = d.poster as Record<string, unknown> | null | undefined;
  // For the widest place the form shows it, the 300-px card preview (the poster step is 168).
  const posterUrl = poster ? (posterSizes(300).map((k) => poster[k]).find((v) => typeof v === "string" && v) as string | undefined) : undefined;
  const status = typeof d.status === "string" ? (d.status as EventFormContext["status"]) : undefined;
  const registered = typeof d.registration_count === "number" ? d.registration_count : typeof d.registrations_count === "number" ? d.registrations_count : 0;
  return { posterUrl: posterUrl ?? null, status, registered, partnersSupported: partnersSupported(raw) };
}

export function EditEventForm({ eventId }: { eventId: number }) {
  const { data, isPending, isError, error } = useEvent(eventId);
  // Which of the club's items it sells, ticked in the form. Waited for, so
  // the ticks are the form's starting point rather than an edit; when it
  // cannot be read the form opens anyway and leaves them as they are.
  const offers = useEventOffers(eventId);
  // Its ticket types, the form's starting point too. Null from a server
  // without them, and on failure the form opens without the editor (and
  // saves nothing about types).
  const tickets = useTicketTypes(eventId);

  if (isPending || offers.isLoading || tickets.isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Skeleton className="h-[40rem] w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="flex items-start gap-3 py-6">
          <AlertTriangleIcon className="text-destructive mt-0.5 size-5 shrink-0" />
          <div className="space-y-1 text-sm">
            <p className="font-medium">Could not load this event.</p>
            <p className="text-muted-foreground">{error instanceof ApiError ? error.message : "Please try again."}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  let defaultValues;
  try {
    defaultValues = { ...eventDetailToFormValues(data), store_item_ids: offers.data?.item_ids, ...formDefaultsFrom(tickets.data) };
  } catch {
    // A shape the mapper cannot read is better surfaced than half-filled: a
    // partially populated form would silently blank fields on save.
    return (
      <Card>
        <CardContent className="flex items-start gap-3 py-6">
          <AlertTriangleIcon className="text-destructive mt-0.5 size-5 shrink-0" />
          <div className="space-y-1 text-sm">
            <p className="font-medium">This event could not be opened for editing.</p>
            <p className="text-muted-foreground">Its data did not match the expected format, so the form was not pre-filled rather than risk overwriting fields with blanks.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return <EventForm mode="edit" eventId={eventId} defaultValues={defaultValues} context={contextOf(data)} />;
}
