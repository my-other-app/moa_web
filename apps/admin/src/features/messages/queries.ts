"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@moa/ui";

import { clearOwnLimits, fetchClubMessages, retryStatement, setOwnLimits } from "./api";
import type { OwnLimitsForm } from "./schemas";

export const MESSAGES_KEY = ["admin", "club-messages"] as const;

export function useClubMessages(clubId: number | null | undefined) {
  return useQuery({
    queryKey: [...MESSAGES_KEY, clubId ?? 0],
    queryFn: () => fetchClubMessages(clubId!),
    enabled: Boolean(clubId && clubId > 0),
    retry: false,
  });
}

export function useSetOwnLimits(clubId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (form: OwnLimitsForm) => setOwnLimits(clubId, form),
    onSuccess: (data) => {
      queryClient.setQueryData([...MESSAGES_KEY, clubId], data);
      toast.success(data.own_limits_apply ? "Message limits saved" : "Saved — they apply once the club is on Enterprise");
    },
    onError: (error: Error) => toast.error(error.message || "Could not save the message limits"),
  });
}

export function useClearOwnLimits(clubId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => clearOwnLimits(clubId),
    onSuccess: (data) => {
      queryClient.setQueryData([...MESSAGES_KEY, clubId], data);
      toast.success("Back on the plan's message limits");
    },
    onError: (error: Error) => toast.error(error.message || "Could not clear the message limits"),
  });
}

export function useRetryStatement(clubId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (statementId: number) => retryStatement(statementId),
    onSuccess: (s) => {
      void queryClient.invalidateQueries({ queryKey: [...MESSAGES_KEY, clubId] });
      if (s.status === "charged") toast.success(`${s.period_label}'s extra is on the club's next invoice`);
      else toast.error("Razorpay still didn't take it. It's left to try again, or to invoice by hand.");
    },
    onError: (error: Error) => toast.error(error.message || "Could not try the charge again"),
  });
}
