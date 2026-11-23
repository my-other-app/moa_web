"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { plural } from "@moa/app-kit";
import { toast } from "@moa/ui";

import { fetchOrganiserCandidates, fetchOrganisers, saveOrganisers } from "./api";
import type { OrganiserInput } from "./schemas";

const key = (eventId: number) => [...qk.events.detail(eventId), "organisers"] as const;
export const candidatesKey = (eventId: number) => [...key(eventId), "candidates"] as const;

export function useOrganisers(eventId: number) {
  return useQuery({ queryKey: key(eventId), queryFn: () => fetchOrganisers(eventId), staleTime: 10_000 });
}

/** Everyone who can be named: the host club's team, then each co-host club's. */
export function useOrganiserCandidates(eventId: number) {
  return useQuery({ queryKey: candidatesKey(eventId), queryFn: () => fetchOrganiserCandidates(eventId), staleTime: 10_000 });
}

/**
 * Saves the organising team. A refusal is the caller's to show: the panel
 * puts the server's message beside the list it is about, not in a toast.
 */
export function useSaveOrganisers(eventId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (members: OrganiserInput[]) => saveOrganisers(eventId, members),
    onSuccess: (_, members) => {
      toast.success(
        members.length
          ? `The event page lists ${plural(members.length, "organiser")}`
          : "The event page shows the whole club team",
      );
      void qc.invalidateQueries({ queryKey: key(eventId) });
    },
  });
}
