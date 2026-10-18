"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@moa/ui";

import { fetchClubDomains, recheckClubDomain, removeClubDomain, type ClubDomainQuery } from "./api";
import { statusLabel, type ClubDomainRow } from "./schemas";

const KEY = ["club-domains"] as const;

export function useClubDomains(query: ClubDomainQuery) {
  return useQuery({
    queryKey: [...KEY, query],
    queryFn: () => fetchClubDomains(query),
    placeholderData: keepPreviousData,
  });
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: KEY }),
      // A domain going live raises an alert, and removing one is written to the activity log.
      queryClient.invalidateQueries({ queryKey: ["admin-alerts"] }),
      queryClient.invalidateQueries({ queryKey: ["audit-log"] }),
    ]);
}

/** What a re-check came to, in a sentence for the toast. */
export function recheckedMessage(before: ClubDomainRow, after: ClubDomainRow | null): { ok: boolean; text: string } {
  if (!after) return { ok: true, text: `Re-checked ${before.host}.` };
  if (after.status === "active") return { ok: true, text: `${after.host} is live.` };
  const why = after.last_error?.trim().replace(/\.$/, "");
  return { ok: after.status !== "failed", text: `Re-checked ${after.host}. ${statusLabel(after.status)}${why ? `: ${why}` : ""}.` };
}

export function useRecheckClubDomain() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (row: ClubDomainRow) => ({ before: row, after: await recheckClubDomain(row.id) }),
    onSuccess: async ({ before, after }) => {
      const said = recheckedMessage(before, after);
      if (said.ok) toast.success(said.text);
      else toast.warning(said.text);
      await refresh();
    },
    onError: async (error: Error) => {
      toast.error(error.message || "Could not re-check it");
      await refresh();
    },
  });
}

export function useRemoveClubDomain() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (row: ClubDomainRow) => {
      await removeClubDomain(row.id);
      return row;
    },
    onSuccess: async (row) => {
      toast.success(`Removed ${row.host}. ${row.club.name}'s site is at its MyOtherApp address again.`);
      await refresh();
    },
    onError: async (error: Error) => {
      toast.error(error.message || "Could not remove it");
      await refresh();
    },
  });
}
