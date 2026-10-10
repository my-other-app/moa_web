"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { toast } from "@moa/ui";

import {
  fetchEventAnalytics,
  fetchRegistrations,
  markAttendance,
  setRegistrationRole,
  type RegistrationQuery,
} from "./api";
import type { RegistrationRole } from "./schemas";

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

export function useSetRegistrationRole(eventId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      registrationId,
      role,
    }: {
      registrationId: string;
      role: RegistrationRole;
    }) => setRegistrationRole(eventId, registrationId, role),
    onSuccess: async () => {
      toast.success("Role updated");
      // The role decides which design this person is issued, so the
      // registrations list has to show the new one.
      await queryClient.invalidateQueries({ queryKey: qk.events.all });
    },
    onError: (error: Error) => toast.error(error.message),
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
