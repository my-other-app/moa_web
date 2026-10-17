"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, qk } from "@moa/api";

import { disconnectGateway, fetchGateway, saveGateway, verifyGateway } from "./api";
import {
  GATEWAY_UNAVAILABLE,
  INVALID_KEYS,
  OWNER_ONLY,
  OWNER_ONLY_MESSAGE,
  TEST_KEYS_MESSAGE,
  TEST_KEYS_NOT_ALLOWED,
  UNAVAILABLE_MESSAGE,
  type Gateway,
  type GatewayKeys,
} from "./schemas";

export const GATEWAY_KEY = ["payments", "gateway"] as const;

/** What a server from before clubs could connect their own Razorpay says: nothing to connect. */
const NOT_ON_THIS_SERVER: Gateway = {
  available: false,
  connected: false,
  status: null,
  mode: null,
  key_id: null,
  webhook_url: null,
  webhook_secret: null,
  webhook_events: [],
  verified_at: null,
  last_webhook_at: null,
  last_error: null,
  can_manage: false,
};

async function readGateway(): Promise<Gateway> {
  try {
    return await fetchGateway();
  } catch (error) {
    // No route at all is a server that predates the feature: the same as one not set up for it.
    if (error instanceof ApiError && error.isNotFound) return NOT_ON_THIS_SERVER;
    throw error;
  }
}

export function useGateway() {
  return useQuery({ queryKey: GATEWAY_KEY, queryFn: readGateway, staleTime: 30_000, retry: false });
}

/**
 * Every write answers with the gateway as it now is, so the page takes that
 * rather than asking again. Events are re-read too: where their payments go
 * (`payments_to`) follows the account.
 */
function useSettle() {
  const queryClient = useQueryClient();
  return (next: Gateway) => {
    queryClient.setQueryData(GATEWAY_KEY, next);
    void queryClient.invalidateQueries({ queryKey: qk.events.all });
  };
}

export function useSaveGateway() {
  const settle = useSettle();
  return useMutation({ mutationFn: (keys: GatewayKeys) => saveGateway(keys), onSuccess: settle });
}

export function useVerifyGateway() {
  const settle = useSettle();
  return useMutation({ mutationFn: verifyGateway, onSuccess: settle });
}

export function useDisconnectGateway() {
  const settle = useSettle();
  return useMutation({ mutationFn: disconnectGateway, onSuccess: settle });
}

/** Which field a refusal is about, so the form can mark it. */
export type KeysProblem = { field: "keys" | "key_id" | null; text: string };

/** A refusal from saving, checking or disconnecting, in words for the club. */
export function gatewayErrorMessage(error: unknown): KeysProblem {
  if (error instanceof ApiError) {
    if (error.errorCode === INVALID_KEYS) {
      const why = error.message?.trim().replace(/\.$/, "");
      return { field: "keys", text: why ? `Razorpay didn't accept these keys: ${why}. Check both and paste them again.` : "Razorpay didn't accept these keys. Check both and paste them again." };
    }
    if (error.errorCode === TEST_KEYS_NOT_ALLOWED) return { field: "key_id", text: TEST_KEYS_MESSAGE };
    if (error.errorCode === GATEWAY_UNAVAILABLE || error.status === 503) return { field: null, text: UNAVAILABLE_MESSAGE };
    if (error.errorCode === OWNER_ONLY || error.isForbidden) return { field: null, text: OWNER_ONLY_MESSAGE };
    return { field: null, text: error.message || "That did not go through. Try again." };
  }
  return { field: null, text: error instanceof Error && error.message ? error.message : "That did not go through. Try again." };
}
