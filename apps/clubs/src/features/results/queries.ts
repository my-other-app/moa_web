"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { nullIfRouteMissing, qk } from "@moa/api";
import { toast } from "@moa/ui";

import { toastError } from "@/features/plan/errors";

import { fetchResults, setGuestPlacing, setTeamPlacing } from "./api";
import { PLACE_NAME } from "./schemas";

export const resultsKey = (eventId: number) => ["results", eventId] as const;

/**
 * The event's results. `null`: a backend from before them (a bare 404) --
 * the Results tab stays hidden, and turns up once the backend has them.
 */
export function useResults(eventId: number, enabled = true) {
  return useQuery({
    queryKey: resultsKey(eventId),
    queryFn: () => nullIfRouteMissing(() => fetchResults(eventId)),
    staleTime: 15_000,
    retry: false,
    enabled,
  });
}

function said(what: string, position: number | null) {
  return position === null ? `${what}: placing cleared` : `${what} placed ${PLACE_NAME[position] ?? `#${position}`}`;
}

export function useSetTeamPlacing(eventId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, position }: { teamId: number; position: number | null; name: string }) => setTeamPlacing(eventId, teamId, position),
    onSuccess: (data, v) => {
      queryClient.setQueryData(resultsKey(eventId), data);
      // The guest list shows each guest's placing too.
      void queryClient.invalidateQueries({ queryKey: qk.events.registrations(eventId) });
      toast.success(said(v.name, v.position));
    },
    onError: toastError,
  });
}

export function useSetGuestPlacing(eventId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ registrationId, position }: { registrationId: string; position: number | null; name: string }) =>
      setGuestPlacing(eventId, registrationId, position),
    onSuccess: (_d, v) => {
      void queryClient.invalidateQueries({ queryKey: resultsKey(eventId) });
      void queryClient.invalidateQueries({ queryKey: qk.events.registrations(eventId) });
      toast.success(said(v.name, v.position));
    },
    onError: toastError,
  });
}
