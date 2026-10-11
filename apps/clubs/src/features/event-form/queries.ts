"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { staleTimes } from "@moa/app-kit";
import { toast } from "@moa/ui";

import { createEvent, deleteEvent, fetchCategories, fetchEvent, fetchInterests, updateEvent, duplicateEvent, type DuplicateInput } from "./api";
import type { EventFormParsed } from "./schemas";

export function useEventCategories() {
  return useQuery({
    queryKey: ["event-categories"],
    queryFn: fetchCategories,
    staleTime: staleTimes.reference,
  });
}

export function useInterests() {
  return useQuery({
    queryKey: qk.interests.all,
    queryFn: fetchInterests,
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
    mutationFn: (values: EventFormParsed) => createEvent(values),
    onSuccess: async () => {
      toast.success("Event published");
      await queryClient.invalidateQueries({ queryKey: qk.events.all });
    },
    onError: (error: Error) => toast.error(error.message),
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
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteEvent,
    onSuccess: async () => {
      toast.success("Event deleted");
      await queryClient.invalidateQueries({ queryKey: qk.events.all });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDuplicateEvent(eventId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: DuplicateInput) => duplicateEvent(eventId, body),
    onSuccess: async (made) => {
      toast.success(`${made.name} created as a draft`, { description: "Set its venue and dates, then publish it." });
      await queryClient.invalidateQueries({ queryKey: qk.events.all });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
