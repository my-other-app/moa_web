"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, qk } from "@moa/api";
import { toast } from "@moa/ui";

import { disconnectGateway, fetchGateway, saveGateway, verifyGateway } from "./api";
import {
  DISABLED_MESSAGE,
  GATEWAY_DISABLED,
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

/** MyOtherApp turned the account off (409 GATEWAY_DISABLED): nothing the club sends is taken until it is on again. */
export function isGatewayDisabled(error: unknown): error is ApiError {
  return error instanceof ApiError && error.errorCode === GATEWAY_DISABLED;
}

/**
 * Every write answers with the gateway as it now is, so the page takes that
 * rather than asking again. Events are re-read too: where their payments go
 * (`payments_to`) follows the account.
 *
 * A write refused because MyOtherApp turned the account off means the page
 * was out of date: the server's words are toasted (the form or button that
 * asked is about to go), and the gateway is read again, which shows it off.
 */
function useSettle() {
  const queryClient = useQueryClient();
  return {
    onSuccess: (next: Gateway) => {
      queryClient.setQueryData(GATEWAY_KEY, next);
      void queryClient.invalidateQueries({ queryKey: qk.events.all });
    },
    onError: (error: unknown) => {
      if (!isGatewayDisabled(error)) return;
      toast.error(error.message?.trim() || DISABLED_MESSAGE);
      void queryClient.invalidateQueries({ queryKey: GATEWAY_KEY });
    },
  };
}

export function useSaveGateway() {
  return useMutation({ mutationFn: (keys: GatewayKeys) => saveGateway(keys), ...useSettle() });
}

export function useVerifyGateway() {
  return useMutation({ mutationFn: verifyGateway, ...useSettle() });
}

export function useDisconnectGateway() {
  return useMutation({ mutationFn: disconnectGateway, ...useSettle() });
}

/** Which field a refusal is about, so the form can mark it. */
export type KeysProblem = { field: "keys" | "key_id" | null; text: string };

/** A refusal from saving, checking or disconnecting, in words for the club. */
export function gatewayErrorMessage(error: unknown): KeysProblem {
  if (isGatewayDisabled(error)) return { field: null, text: error.message?.trim() || DISABLED_MESSAGE };
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
