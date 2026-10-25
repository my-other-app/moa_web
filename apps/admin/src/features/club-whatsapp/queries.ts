"use client";

import { useQuery } from "@tanstack/react-query";
import { nullIfRouteMissing } from "@moa/api";

import { fetchClubWhatsApp, fetchFallbackClubs } from "./api";

/** `null`: a backend from before clubs' own WhatsApp (the route answers a bare 404): no card yet. */
export function useClubWhatsApp(clubId: number) {
  return useQuery({
    queryKey: ["admin", "club-whatsapp", clubId],
    queryFn: () => nullIfRouteMissing(() => fetchClubWhatsApp(clubId)),
    staleTime: 60_000,
    retry: false,
  });
}

/** The clubs whose WhatsApp deliveries fell back most this month. `null`: a backend from before it. */
export function useFallbackClubs(limit = 10) {
  return useQuery({
    queryKey: ["admin", "club-whatsapp", "fallbacks", limit],
    queryFn: () => nullIfRouteMissing(() => fetchFallbackClubs(limit)),
    staleTime: 5 * 60_000,
    retry: false,
  });
}
