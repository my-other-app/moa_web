"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { nullIfRouteMissing } from "@moa/api";
import { toast } from "@moa/ui";

import { clearOwnLimits, fetchClubMessages, setOwnLimits } from "./api";
import {
  createPack,
  fetchClubCredits,
  fetchPacks,
  grantCredits,
  refundPurchase,
  updatePack,
  type GrantInput,
  type PackInput,
} from "./credits";
import type { OwnLimitsForm } from "./schemas";

export const MESSAGES_KEY = ["admin", "club-messages"] as const;
export const CREDITS_KEY = ["admin", "club-credits"] as const;
export const PACKS_KEY = ["admin", "credit-packs"] as const;

/** `null`: a backend from before message quotas (the route answers a bare 404): no panel yet. */
export function useClubMessages(clubId: number | null | undefined) {
  return useQuery({
    queryKey: [...MESSAGES_KEY, clubId ?? 0],
    queryFn: () => nullIfRouteMissing(() => fetchClubMessages(clubId!)),
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

// ─── Prepaid credits ─────────────────────────────────────────────────────

/** `null`: a backend from before prepaid credits: no Credits panel. */
export function useClubCredits(clubId: number | null | undefined) {
  return useQuery({
    queryKey: [...CREDITS_KEY, clubId ?? 0],
    queryFn: () => nullIfRouteMissing(() => fetchClubCredits(clubId!)),
    enabled: Boolean(clubId && clubId > 0),
    retry: false,
  });
}

export function useGrantCredits(clubId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: GrantInput) => grantCredits(clubId, input),
    onSuccess: (data, input) => {
      queryClient.setQueryData([...CREDITS_KEY, clubId], data);
      void queryClient.invalidateQueries({ queryKey: [...MESSAGES_KEY, clubId] });
      toast.success(`${input.quantity.toLocaleString("en-IN")} ${input.channel === "email" ? "email" : "WhatsApp"} credits granted`);
    },
    onError: (error: Error) => toast.error(error.message || "Could not grant the credits"),
  });
}

export function useRefundPurchase(clubId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ purchaseId, reason, amount_paise }: { purchaseId: number; reason: string; amount_paise: number | null }) =>
      refundPurchase(purchaseId, { reason, amount_paise }),
    onSuccess: (p) => {
      void queryClient.invalidateQueries({ queryKey: [...CREDITS_KEY, clubId] });
      if (p.status === "refunded") toast.success(`${p.receipt_number || "Purchase"} refunded; its unused credits are removed`);
      else if (p.status === "refund_failed") toast.error(p.refund_error || "Razorpay refused the refund. The credits are removed; try the refund again.");
      else toast.success("Refund asked of Razorpay; its unused credits are removed");
    },
    onError: (error: Error) => {
      void queryClient.invalidateQueries({ queryKey: [...CREDITS_KEY, clubId] });
      toast.error(error.message || "Could not refund the purchase");
    },
  });
}

/** `null`: a backend from before prepaid credits: no packs editor. */
export function useCreditPacks() {
  return useQuery({ queryKey: PACKS_KEY, queryFn: () => nullIfRouteMissing(fetchPacks), retry: false, staleTime: 60_000 });
}

export function useCreatePack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PackInput) => createPack(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PACKS_KEY });
      toast.success("Pack added");
    },
    onError: (error: Error) => toast.error(error.message || "Could not add the pack"),
  });
}

export function useUpdatePack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changes }: { id: number; changes: Partial<Omit<PackInput, "channel">> }) => updatePack(id, changes),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PACKS_KEY });
      toast.success("Pack saved");
    },
    onError: (error: Error) => toast.error(error.message || "Could not save the pack"),
  });
}
