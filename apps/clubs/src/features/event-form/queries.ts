"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { staleTimes } from "@moa/app-kit";
import { toast } from "@moa/ui";

import { ENTITLEMENTS_KEY } from "@/features/billing/queries";
import { toastError } from "@/features/plan/errors";
import { skippedNotice } from "@/features/plan/schemas";

import { createEvent, deleteEvent, fetchCategories, fetchEvent, publishEvent, updateEvent, duplicateEvent, type DuplicateInput } from "./api";
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
    mutationFn: ({ values, status }: { values: EventFormParsed; status: "draft" | "published" }) => createEvent(values, status),
    onSuccess: async (_made, { status }) => {
      toast.success(status === "draft" ? "Saved as a draft" : "Event published");
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
    mutationFn: (values: EventFormParsed) => updateEvent(eventId, values),
    onSuccess: async () => {
      toast.success("Event updated");
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
