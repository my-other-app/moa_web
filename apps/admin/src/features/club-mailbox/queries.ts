"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, nullIfRouteMissing } from "@moa/api";

import { isAheadOfApi } from "@/lib/ahead-of-api";

import { backfillAddresses, changeClubAddress, fetchClubMailbox } from "./api";
import { MAILBOX_ERROR_TEXT } from "./schemas";

const KEY = ["admin", "club-mailbox"] as const;

/** `null`: a backend from before club mailboxes (the route answers a bare 404): no card yet. */
export function useClubMailbox(clubId: number) {
  return useQuery({
    queryKey: [...KEY, clubId],
    queryFn: () => nullIfRouteMissing(() => fetchClubMailbox(clubId)),
    staleTime: 60_000,
    retry: false,
  });
}

/** Change the club's address: the card shows the new one, and its old one forwarding, at once. */
export function useChangeClubAddress(clubId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (handle: string) => changeClubAddress(clubId, handle),
    onSuccess: (next) => queryClient.setQueryData([...KEY, clubId], next),
  });
}

/** Give every club without an address its own (dry run first). Every card reads again after. */
export function useBackfillAddresses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dryRun: boolean) => backfillAddresses(dryRun),
    onSuccess: (_r, dryRun) => {
      if (!dryRun) void queryClient.invalidateQueries({ queryKey: KEY });
    },
  });
}

/** A refusal in words: a server without the route, the server's sentence, else this table's. */
export function mailboxErrorText(error: unknown): string {
  if (isAheadOfApi(error)) return "That isn't available on this server yet.";
  if (error instanceof ApiError) return error.message?.trim() || (error.errorCode ? MAILBOX_ERROR_TEXT[error.errorCode] : undefined) || "That did not go through. Try again.";
  return error instanceof Error && error.message ? error.message : "That did not go through. Try again.";
}
