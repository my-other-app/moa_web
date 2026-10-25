"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { staleTimes } from "@moa/app-kit";
import { toast } from "@moa/ui";

import { ApiError } from "@moa/api";

import { ENTITLEMENTS_KEY } from "@/features/billing/queries";
import { isPlanLockError, reportPlanError, toastError } from "@/features/plan/errors";
import { saveFormTicketTypes } from "@/features/ticketing/api";
import { feeFromTypes } from "@/features/ticketing/schemas";
import { TICKETING_KEY, ticketingError } from "@/features/ticketing/queries";
import { skippedNotice } from "@/features/plan/schemas";

import { createEvent, deleteEvent, fetchCategories, fetchEvent, publishEvent, saveDraftAgenda, updateEvent, duplicateEvent, type DuplicateInput } from "./api";
import type { EventFormParsed } from "./schemas";

export function useEventCategories() {
  return useQuery({
    queryKey: ["event-categories"],
    queryFn: fetchCategories,
    staleTime: staleTimes.reference,
  });
}

export function useEvent(eventId: number | undefined) {
  return useQuery({
    queryKey: qk.events.detail(eventId ?? -1),
    queryFn: () => fetchEvent(eventId!),
    enabled: eventId !== undefined,
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ values, status }: { values: EventFormParsed; status: "draft" | "published" }) => {
      // With several ticket types the event's own fee is what they charge (the lowest price).
      const made = await createEvent(feeFromTypes(values), status);
      // The running order goes to the agenda once there is an event to hang it on.
      const agenda = await saveDraftAgenda(made.id, values.event_datetime, values.agenda);
      // Its ticket types, once there is an event to sell them; the event stands either way.
      let ticketTypesError: unknown = null;
      if (values.several_types && values.ticket_types?.length) {
        try {
          await saveFormTicketTypes(made.id, values);
        } catch (error) {
          ticketTypesError = error;
        }
      }
      return { ...made, agenda, ticketTypesError };
    },
    onSuccess: async (made, { status }) => {
      toast.success(status === "draft" ? "Saved as a draft" : "Event published");
      if (made.agenda.failed > 0) toast.warning(`The event is saved, but ${made.agenda.failed === 1 ? "one agenda block wasn't" : `${made.agenda.failed} agenda blocks weren't`}. Add ${made.agenda.failed === 1 ? "it" : "them"} on the event's Agenda tab.`);
      if (made.ticketTypesError && !reportPlanError(made.ticketTypesError)) {
        toast.warning(`The event is saved, but its ticket types weren't: ${ticketingError(made.ticketTypesError)} Set them under the event's Settings.`);
      }
      void queryClient.invalidateQueries({ queryKey: TICKETING_KEY });
      // The month's count of events moved.
      void queryClient.invalidateQueries({ queryKey: ENTITLEMENTS_KEY });
      await queryClient.invalidateQueries({ queryKey: qk.events.all });
    },
    onError: toastError,
  });
}

export function usePublishEvent(eventId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => publishEvent(eventId),
    onSuccess: async () => {
      toast.success("Event published");
      await Promise.all([queryClient.invalidateQueries({ queryKey: qk.events.all }), queryClient.invalidateQueries({ queryKey: qk.events.detail(eventId) })]);
    },
    onError: toastError,
  });
}

export function useUpdateEvent(eventId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: EventFormParsed) => {
      // Its ticket types first: refused (a type people hold, a plan's cap), nothing is saved.
      if (values.ticket_types !== undefined) {
        try {
          await saveFormTicketTypes(eventId, values);
        } catch (error) {
          // A plan refusal goes to the upgrade dialog as it is; any other, in words the form can show.
          if (isPlanLockError(error) || !(error instanceof ApiError)) throw error;
          throw new ApiError({ message: ticketingError(error), status: error.status, errorCode: error.errorCode });
        }
      }
      return updateEvent(eventId, feeFromTypes(values));
    },
    onSuccess: async () => {
      toast.success("Event updated");
      void queryClient.invalidateQueries({ queryKey: TICKETING_KEY });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.events.all }),
        queryClient.invalidateQueries({ queryKey: qk.events.detail(eventId) }),
      ]);
    },
    onError: toastError,
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteEvent,
    onSuccess: async () => {
      toast.success("Event deleted");
      void queryClient.invalidateQueries({ queryKey: ENTITLEMENTS_KEY });
      await queryClient.invalidateQueries({ queryKey: qk.events.all });
    },
    onError: toastError,
  });
}

export function useDuplicateEvent(eventId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: DuplicateInput) => duplicateEvent(eventId, body),
    onSuccess: async (made) => {
      toast.success(`${made.name} created as a draft`, { description: "Set its venue and dates, then publish it." });
      // What the plan kept out of the copy, said once, so nobody hunts for it later.
      const left = skippedNotice(made.skipped);
      if (left) toast.info(left);
      void queryClient.invalidateQueries({ queryKey: ENTITLEMENTS_KEY });
      await queryClient.invalidateQueries({ queryKey: qk.events.all });
    },
    onError: toastError,
  });
}
