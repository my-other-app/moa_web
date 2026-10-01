"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { toast } from "@moa/ui";

import {
  fetchEventAnalytics,
  fetchRegistrations,
  markAttendance,
  type RegistrationQuery,
} from "./api";

export function useRegistrations(query: RegistrationQuery) {
  return useQuery({
    queryKey: [...qk.events.registrations(query.eventId), query],
    queryFn: () => fetchRegistrations(query),
    placeholderData: keepPreviousData,
  });
}

export function useEventAnalytics(eventId: number) {
  return useQuery({
    queryKey: [...qk.events.detail(eventId), "analytics"],
    queryFn: () => fetchEventAnalytics(eventId),
    staleTime: 30_000,
  });
}

export function useMarkAttendance(eventId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (registrationId: string) => markAttendance(eventId, registrationId),
    onSuccess: async () => {
      toast.success("Marked as attended");
      // The attendance counts on the events list and the analytics header both
      // move, so invalidate the whole event subtree rather than one query.
      await queryClient.invalidateQueries({ queryKey: qk.events.all });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
