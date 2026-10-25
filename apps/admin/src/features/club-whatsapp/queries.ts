"use client";

import { useQuery } from "@tanstack/react-query";
import { nullIfRouteMissing } from "@moa/api";

import { fetchClubWhatsApp } from "./api";

/** `null`: a backend from before clubs' own WhatsApp (the route answers a bare 404): no card yet. */
export function useClubWhatsApp(clubId: number) {
  return useQuery({
    queryKey: ["admin", "club-whatsapp", clubId],
    queryFn: () => nullIfRouteMissing(() => fetchClubWhatsApp(clubId)),
    staleTime: 60_000,
    retry: false,
  });
}
