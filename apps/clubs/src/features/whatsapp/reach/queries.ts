"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, nullIfRouteMissing } from "@moa/api";

import { ACCOUNT_KEY, OVERVIEW_KEY, TEMPLATES_KEY, WA_KEY } from "../queries";
import { NO_WHATSAPP, TEMPLATE_NOT_APPROVED, WHATSAPP_FAILED, type Account } from "../schemas";
import {
  cancelBroadcast,
  connectWithMeta,
  createBroadcast,
  fetchBroadcast,
  fetchBroadcasts,
  fetchReach,
  fetchSpend,
  previewBroadcast,
  reportSignupEvent,
  setKinds,
  type BroadcastBody,
  type SignupBody,
  type SignupEventBody,
} from "./api";
import type { Broadcast, BroadcastList, Kinds, Reach } from "./schemas";

export const REACH_KEY = [...WA_KEY, "reach"] as const;
export const SPEND_KEY = [...WA_KEY, "spend"] as const;
export const BROADCASTS_KEY = [...WA_KEY, "broadcasts"] as const;

/**
 * Routing by kind, Connect with Meta's settings, the messaging limit.
 * `null`: a backend from before them (the route answers a bare 404) -- the
 * kinds' switches, the button and the Broadcasts tab stay out of sight,
 * and appear on the next read once it is deployed.
 */
export function useReach(enabled = true) {
  return useQuery({ queryKey: REACH_KEY, queryFn: () => nullIfRouteMissing(fetchReach), staleTime: 30_000, retry: false, enabled });
}

export function useSetKinds() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (kinds: Partial<Kinds>) => setKinds(kinds),
    onSuccess: (next: Reach) => queryClient.setQueryData(REACH_KEY, next),
  });
}

/** This month's spend, as the backend last read it from Meta (never on a page view). `null`: not on this server. */
export function useSpend(enabled = true) {
  return useQuery({ queryKey: SPEND_KEY, queryFn: () => nullIfRouteMissing(fetchSpend), staleTime: 60_000, retry: false, enabled });
}

/** The club's broadcasts, read again every 10 s while one is sending. `null`: not on this server. */
export function useBroadcasts(enabled = true) {
  return useQuery<BroadcastList | null>({
    queryKey: BROADCASTS_KEY,
    queryFn: () => nullIfRouteMissing(() => fetchBroadcasts()),
    staleTime: 5_000,
    retry: false,
    enabled,
    refetchInterval: (q) => (q.state.data?.items.some((b) => b.status === "sending") ? 10_000 : false),
  });
}

export function useBroadcast(id: number | null) {
  return useQuery({ queryKey: [...BROADCASTS_KEY, id], queryFn: () => fetchBroadcast(id!), enabled: id !== null, retry: false });
}

export function usePreviewBroadcast() {
  return useMutation({ mutationFn: (body: BroadcastBody) => previewBroadcast(body) });
}

function useSettleBroadcasts() {
  const queryClient = useQueryClient();
  return (b: Broadcast) => {
    queryClient.setQueryData([...BROADCASTS_KEY, b.id], b);
    void queryClient.invalidateQueries({ queryKey: BROADCASTS_KEY });
    void queryClient.invalidateQueries({ queryKey: SPEND_KEY });
  };
}

export function useCreateBroadcast() {
  const settle = useSettleBroadcasts();
  return useMutation({ mutationFn: (body: BroadcastBody) => createBroadcast(body), onSuccess: settle });
}

export function useCancelBroadcast() {
  const settle = useSettleBroadcasts();
  return useMutation({ mutationFn: (id: number) => cancelBroadcast(id), onSuccess: settle });
}

/** The code is the mutation's variable: gcTime 0, so it isn't kept once nothing watches the call. */
export function useConnectWithMeta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SignupBody) => connectWithMeta(body),
    gcTime: 0,
    onSuccess: (next: Account) => {
      queryClient.setQueryData(ACCOUNT_KEY, next);
      void queryClient.invalidateQueries({ queryKey: REACH_KEY });
      void queryClient.invalidateQueries({ queryKey: OVERVIEW_KEY });
      void queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
    },
  });
}

export function useReportSignupEvent() {
  return useMutation({ mutationFn: (body: SignupEventBody) => reportSignupEvent(body) });
}

/** Which field a broadcast refusal is about, and its words. */
export interface BroadcastProblem {
  field: string | null;
  text: string;
}

export function broadcastErrorMessage(error: unknown): BroadcastProblem {
  if (error instanceof ApiError) {
    const details = (error.fieldErrors ?? {}) as Record<string, unknown>;
    const field = typeof details.field === "string" ? details.field : null;
    if (error.errorCode === NO_WHATSAPP) return { field: null, text: "Connect your WhatsApp number first." };
    if (error.errorCode === WHATSAPP_FAILED) return { field: null, text: "Your WhatsApp number isn't working right now. Check it in WhatsApp settings." };
    if (error.errorCode === TEMPLATE_NOT_APPROVED) return { field: "template", text: error.message || "That template isn't approved on your WhatsApp account." };
    if (error.errorCode === "NO_RECIPIENTS") return { field: null, text: error.message || "Nobody would get it." };
    return { field, text: error.message || "That did not go through. Try again." };
  }
  return { field: null, text: error instanceof Error && error.message ? error.message : "That did not go through. Try again." };
}

/** A refusal of Connect with Meta, in words. */
export function signupErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.errorCode === "EMBEDDED_SIGNUP_CODE_EXPIRED") return "Meta's sign-in expired before it could be finished. Click Connect with Meta again.";
    if (error.errorCode === "EMBEDDED_SIGNUP_OFF") return "Connecting with Meta isn't available right now. Paste your app's keys instead.";
    return error.message || "Meta's sign-in didn't go through. Try again.";
  }
  return error instanceof Error && error.message ? error.message : "Meta's sign-in didn't go through. Try again.";
}
