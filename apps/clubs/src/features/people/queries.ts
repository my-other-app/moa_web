"use client";

import { useQuery } from "@tanstack/react-query";
import { qk } from "@moa/api";

import { fetchGuestProfile } from "./api";
import type { GuestProfileData } from "./schemas";

export const profileKey = (eventId: number, ref: string | null) => [...qk.events.registrations(eventId), "profile", ref] as const;

/** How often the profile is read while a card is on its way to the printer. */
export const LIVE_MS = 5_000;

/** A card the print station has not finished with. */
export const cardInFlight = (p: GuestProfileData | undefined) => Boolean(p?.prints.some((x) => x.status === "queued" || x.status === "printing"));

/**
 * One person. Read again every 5 seconds while a card is queued or printing,
 * otherwise when the window gets focus back (and after every change made here).
 */
export function useGuestProfile(eventId: number, ref: string | null) {
  return useQuery({
    queryKey: profileKey(eventId, ref),
    queryFn: () => fetchGuestProfile(eventId, ref!),
    enabled: Boolean(ref),
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: (q) => (cardInFlight(q.state.data) ? LIVE_MS : false),
    refetchIntervalInBackground: false,
  });
}
