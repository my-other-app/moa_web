"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { qk } from "@moa/api";
import { toast } from "@moa/ui";

import {
  deleteEvent,
  fetchEvent,
  fetchEventAnalytics,
  fetchEventRegistrations,
  fetchEvents,
  fetchDeletedEvents,
  restoreEvent,
  updateEvent,
  setEventWinner,
  type EventListQuery,
  type RegistrationQuery,
} from "./api";

export function useEvents(query: EventListQuery) {
  return useQuery({
    queryKey: qk.events.list(query),
    queryFn: () => fetchEvents(query),
    placeholderData: keepPreviousData,
  });
}

export function useEvent(eventId: number) {
  return useQuery({
    queryKey: qk.events.detail(eventId),
    queryFn: () => fetchEvent(eventId),
  });
}

export function useEventAnalytics(eventId: number) {
  return useQuery({
    queryKey: [...qk.events.detail(eventId), "analytics"],
    queryFn: () => fetchEventAnalytics(eventId),
  });
}

export function useEventRegistrations(eventId: number, query: RegistrationQuery) {
  return useQuery({
    queryKey: [...qk.events.registrations(eventId), query],
    queryFn: () => fetchEventRegistrations(eventId, query),
    placeholderData: keepPreviousData,
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteEvent,
    onSuccess: async () => {
      toast.success("Event deleted");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.events.all }),
        queryClient.invalidateQueries({ queryKey: qk.analytics.all }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useSetEventWinner(eventId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      registrationId,
      position,
    }: {
      registrationId: string;
      position: number | null;
    }) => setEventWinner(eventId, registrationId, position),
    onSuccess: async (_data, variables) => {
      toast.success(
        variables.position === null ? "Placing cleared" : "Placing recorded"
      );
      // A placing can earn a badge, and the holder's own badge list is read
      // by the user page, so that subtree moves too.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.events.all }),
        queryClient.invalidateQueries({ queryKey: qk.badges.all }),
        queryClient.invalidateQueries({ queryKey: qk.users.all }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useUpdateEvent(eventId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => updateEvent(eventId, input),
    onSuccess: async () => {
      toast.success("Event updated");
      await queryClient.invalidateQueries({ queryKey: qk.events.all });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDeletedEvents(query: { offset: number; limit: number }) {
  return useQuery({
    queryKey: [...qk.events.all, "deleted", query],
    queryFn: () => fetchDeletedEvents(query),
    placeholderData: keepPreviousData,
  });
}

export function useRestoreEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: restoreEvent,
    onSuccess: async () => {
      toast.success("Event restored");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.events.all }),
        queryClient.invalidateQueries({ queryKey: ["audit-log"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
