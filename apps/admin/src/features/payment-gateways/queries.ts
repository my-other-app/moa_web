"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@moa/ui";

import { disableGateway, fetchGateways, type GatewayQuery } from "./api";

const KEY = ["payment-gateways"] as const;

export function useGateways(query: GatewayQuery) {
  return useQuery({
    queryKey: [...KEY, query],
    queryFn: () => fetchGateways(query),
    placeholderData: keepPreviousData,
  });
}

export function useDisableGateway() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (clubId: number) => disableGateway(clubId),
    onSuccess: async (row) => {
      toast.success(`Disabled. ${row.club.name}'s new payments go to MyOtherApp's account.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: KEY }),
        // Disabling raises an alert and is written to the activity log.
        queryClient.invalidateQueries({ queryKey: ["admin-alerts"] }),
        queryClient.invalidateQueries({ queryKey: ["audit-log"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message || "Could not disable it"),
  });
}
