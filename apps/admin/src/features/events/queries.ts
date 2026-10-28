"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ApiError, qk } from "@moa/api";
import { toast } from "@moa/ui";

import {
  deleteEvent,
  downloadUnderReviewCsv,
  fetchEvent,
  fetchEventCategories,
  fetchEventAnalytics,
  fetchEventSummary,
  fetchEventRegistrations,
  fetchEvents,
  fetchDeletedEvents,
  fetchUnderReview,
  restoreEvent,
  updateEvent,
  setEventWinner,
  type EventListQuery,
  type RegistrationQuery,
  type ReviewQuery,
} from "./api";

/**
 * The read, or `null` when this server won't show an admin the list: one
 * from before registrations were reviewed has no route (404), and one from
 * before admins could read them refuses (401, 403). The section stays away
 * rather than showing an error for something the admin can't fix.
 */
async function nullIfNotOffered<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof ApiError && [401, 403, 404].includes(error.status)) return null;
    throw error;
  }
}

/** One page of an event's registrations under review, or null (nullIfNotOffered). */
export function useUnderReview(eventId: number, query: ReviewQuery, enabled = true) {
  return useQuery({
    queryKey: [...qk.events.detail(eventId), "under-review", query],
    queryFn: () => nullIfNotOffered(() => fetchUnderReview(eventId, query)),
    enabled,
    // Another tab, page or search keeps the counts and the toolbar on screen while it loads.
    placeholderData: keepPreviousData,
    retry: false,
  });
}

/** Every registration under review of the event, as the server's CSV. */
export function useExportUnderReview(eventId: number) {
  return useMutation({
    mutationFn: () => downloadUnderReviewCsv(eventId),
    onSuccess: () => toast.success("Registrations under review exported"),
    onError: (error: Error) =>
      toast.error(error.message || "The export didn't go through. Try again."),
  });
}

export function useEvents(query: EventListQuery) {
  return useQuery({
    queryKey: qk.events.list(query),
    queryFn: () => fetchEvents(query),
    placeholderData: keepPreviousData,
  });
}

/** The category filter's options. Reference data: rarely changes, so a long
 *  stale time keeps it out of the way of every keystroke in the search box. */
export function useEventCategories() {
  return useQuery({
    queryKey: ["event-categories"],
    queryFn: fetchEventCategories,
    staleTime: 10 * 60 * 1000,
  });
}

export function useEvent(eventId: number) {
  return useQuery({
    queryKey: qk.events.detail(eventId),
    queryFn: () => fetchEvent(eventId),
  });
}

export function useEventSummary(eventId: number) {
  return useQuery({
    queryKey: [...qk.events.detail(eventId), "summary"],
    queryFn: () => fetchEventSummary(eventId),
    staleTime: 15_000,
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
