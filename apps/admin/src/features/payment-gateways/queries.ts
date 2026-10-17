"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@moa/ui";

import { disableGateway, enableGateway, fetchGateways, type GatewayQuery } from "./api";
import type { GatewayRow } from "./schemas";

const KEY = ["payment-gateways"] as const;

export function useGateways(query: GatewayQuery) {
  return useQuery({
    queryKey: [...KEY, query],
    queryFn: () => fetchGateways(query),
    placeholderData: keepPreviousData,
  });
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: KEY }),
      // Turning one off or on raises an alert and is written to the activity log.
      queryClient.invalidateQueries({ queryKey: ["admin-alerts"] }),
      queryClient.invalidateQueries({ queryKey: ["audit-log"] }),
    ]);
}

export function useDisableGateway() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (clubId: number) => disableGateway(clubId),
    onSuccess: async (row) => {
      toast.success(`Disabled. ${row.club.name}'s new payments go to MyOtherApp's account.`);
      await refresh();
    },
    onError: async (error: Error) => {
      toast.error(error.message || "Could not disable it");
      await refresh();
    },
  });
}

/** What turning it back on came to: the stored keys still work, or Razorpay refused them. */
export function enabledMessage(row: GatewayRow): { ok: boolean; text: string } {
  if (row.status === "active") return { ok: true, text: `Enabled. Razorpay accepted ${row.club.name}'s keys, so its new payments go to its own account again.` };
  const why = row.last_error?.trim().replace(/\.$/, "");
  return {
    ok: false,
    text: `Enabled, but Razorpay refused ${row.club.name}'s stored keys${why ? `: ${why}` : ""}. Its payments stay with MyOtherApp until the club replaces them.`,
  };
}

export function useEnableGateway() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (clubId: number) => enableGateway(clubId),
    onSuccess: async (row) => {
      const said = enabledMessage(row);
      if (said.ok) toast.success(said.text);
      else toast.warning(said.text);
      await refresh();
    },
    // 409 NOT_DISABLED or 404 NO_GATEWAY: the row was out of date. The server's words, and the list read again.
    onError: async (error: Error) => {
      toast.error(error.message || "Could not enable it");
      await refresh();
    },
  });
}
