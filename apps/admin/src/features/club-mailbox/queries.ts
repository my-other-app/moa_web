"use client";

import { useQuery } from "@tanstack/react-query";
import { nullIfRouteMissing } from "@moa/api";

import { fetchClubMailbox } from "./api";

/** `null`: a backend from before club mailboxes (the route answers a bare 404): no card yet. */
export function useClubMailbox(clubId: number) {
  return useQuery({
    queryKey: ["admin", "club-mailbox", clubId],
    queryFn: () => nullIfRouteMissing(() => fetchClubMailbox(clubId)),
    staleTime: 60_000,
    retry: false,
  });
}
