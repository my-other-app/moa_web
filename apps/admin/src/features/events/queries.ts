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
