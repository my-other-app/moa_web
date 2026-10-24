"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchClubWhatsApp } from "./api";

export function useClubWhatsApp(clubId: number) {
  return useQuery({ queryKey: ["admin", "club-whatsapp", clubId], queryFn: () => fetchClubWhatsApp(clubId), staleTime: 60_000, retry: false });
}
