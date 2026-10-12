"use client";

import { AlertTriangleIcon } from "lucide-react";
import { ApiError } from "@moa/api";
import { Card, CardContent, Skeleton } from "@moa/ui";

import { useEvent } from "../queries";
import { eventDetailToFormValues } from "../mapper";
import { EventForm } from "./event-form";

export function EditEventForm({ eventId }: { eventId: number }) {
  const { data, isPending, isError, error } = useEvent(eventId);

  if (isPending) {
    return (
      <div className="grid gap-3.5 lg:grid-cols-[180px_1fr]">
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-[40rem] w-full rounded-2xl" />
      </div>
    );
  }

  if (isError || !data) {
    const is500 = error instanceof ApiError && error.isServer;
    return (
      <Card>
        <CardContent className="flex items-start gap-3 py-6">
          <AlertTriangleIcon className="text-destructive mt-0.5 size-5 shrink-0" />
          <div className="space-y-1 text-sm">
            <p className="font-medium">Could not load this event.</p>
            <p className="text-muted-foreground">
              {is500
                ? "The event detail endpoint returned a server error. If this persists, the backend may be running a build that predates the MissingGreenlet fix for GET /events/info."
                : error instanceof ApiError
                  ? error.message
                  : "Please try again."}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  let defaultValues;
  try {
    defaultValues = eventDetailToFormValues(data);
  } catch {
    // A shape the mapper cannot read is better surfaced than half-filled: a
    // partially populated form would silently blank fields on save.
    return (
      <Card>
        <CardContent className="flex items-start gap-3 py-6">
          <AlertTriangleIcon className="text-destructive mt-0.5 size-5 shrink-0" />
          <div className="space-y-1 text-sm">
            <p className="font-medium">This event could not be opened for editing.</p>
            <p className="text-muted-foreground">
              Its data did not match the expected format, so the form was not
              pre-filled rather than risk overwriting fields with blanks.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return <EventForm mode="edit" eventId={eventId} defaultValues={defaultValues} />;
}
