"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { toast } from "@moa/ui";

import { toastError } from "@/features/plan/errors";

import {
  addAttendee,
  fetchEventAnalytics,
  fetchImports,
  fetchRegistration,
  fetchRegistrations,
  importRegistrations,
  markAttendance,
  removeRegistration,
  setRegistrationRole,
  updateRegistration,
  type NewAttendee,
  type RegistrationPatch,
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
    onError: toastError,
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
    onError: toastError,
  });
}

export function useRegistration(eventId: number, registrationId: string | null) {
  return useQuery({
    queryKey: [...qk.events.registrations(eventId), "detail", registrationId],
    queryFn: () => fetchRegistration(eventId, registrationId!),
    enabled: !!registrationId,
  });
}

/** Every change to the list refreshes the list, the detail and the delivery numbers that read from it. */
function useRefreshList(eventId: number) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: qk.events.all });
  };
}

export function useUpdateRegistration(eventId: number) {
  const refresh = useRefreshList(eventId);
  return useMutation({
    mutationFn: ({ registrationId, patch }: { registrationId: string; patch: RegistrationPatch }) =>
      updateRegistration(eventId, registrationId, patch),
    onSuccess: () => {
      toast.success("Details corrected");
      refresh();
    },
    onError: toastError,
  });
}

export function useRemoveRegistration(eventId: number) {
  const refresh = useRefreshList(eventId);
  return useMutation({
    mutationFn: ({ registrationId, confirmSlug }: { registrationId: string; confirmSlug: string }) =>
      removeRegistration(eventId, registrationId, confirmSlug),
    onSuccess: () => {
      toast.success("Removed from the list", { description: "Their record, ticket and check-in are gone." });
      refresh();
    },
    onError: toastError,
  });
}

export function useAddAttendee(eventId: number) {
  const refresh = useRefreshList(eventId);
  return useMutation({
    mutationFn: (body: NewAttendee) => addAttendee(eventId, body),
    onSuccess: (r) => {
      toast.success(`${r.full_name ?? "They"} added to the list`, { description: "Send tickets delivers theirs." });
      refresh();
    },
    onError: toastError,
  });
}

export function useImports(eventId: number) {
  return useQuery({
    queryKey: [...qk.events.registrations(eventId), "imports"],
    queryFn: () => fetchImports(eventId),
    // An import runs in the background after the upload answers; the record
    // fills in as rows are processed.
    refetchInterval: (query) => (query.state.data?.some((log) => log.status === "STARTED") ? 2_000 : false),
    staleTime: 10_000,
  });
}

export function useImportRegistrations(eventId: number) {
  const refresh = useRefreshList(eventId);
  return useMutation({
    mutationFn: (file: File) => importRegistrations(eventId, file),
    onSuccess: () => {
      toast.success("Import started", { description: "Rows appear on the list as they are processed; the record below says what happened to each." });
      refresh();
    },
    onError: toastError,
  });
}
