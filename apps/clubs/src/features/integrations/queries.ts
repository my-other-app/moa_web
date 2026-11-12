"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@moa/ui";

import { useAccess, useMyAccess } from "@/features/access";
import { toastError } from "@/features/plan";

import {
  createEndpoint,
  createKey,
  decideConsent,
  deleteEndpoint,
  disconnectApp,
  fetchConnections,
  fetchConsent,
  fetchDeliveries,
  fetchEndpoints,
  fetchKeys,
  fetchStatus,
  fetchUsage,
  fetchWebhookStatus,
  retryDelivery,
  revokeKey,
  rotateEndpointSecret,
  rotateKey,
  testEndpoint,
  updateEndpoint,
  type ConsentDecision,
} from "./api";
import { deliveryOutcome, integrationsVisible, type Connection, type CreateKeyBody, type Endpoint, type EndpointBody, type OAuthParams } from "./schemas";

export const INTEGRATIONS_KEY = ["integrations"] as const;
const STATUS_KEY = [...INTEGRATIONS_KEY, "status"] as const;
const KEYS_KEY = [...INTEGRATIONS_KEY, "keys"] as const;
const ENDPOINTS_KEY = [...INTEGRATIONS_KEY, "webhooks"] as const;
const APPS_KEY = [...INTEGRATIONS_KEY, "apps"] as const;
const deliveriesKey = (endpointId: string, status: string | undefined) => [...ENDPOINTS_KEY, endpointId, "deliveries", status ?? "all"] as const;

/** How often an API (or a club) without integrations is asked again, so the section turns up by itself. */
export const NOT_ON_SERVER_EVERY = 15 * 60_000;

/**
 * Who may manage integrations: the club's owner and its admins. The server
 * refusing is what holds; this only keeps out of sight what it would refuse.
 */
export function useIntegrationsRole(): { manage: boolean; known: boolean } {
  const access = useAccess();
  const me = useMyAccess();
  return { manage: Boolean(access.can.integrations), known: access.known || me.isError };
}

/** The club's access; `null` while there is nothing to show (asked again now and then). */
export function useIntegrationsStatus(enabled = true) {
  return useQuery({
    queryKey: STATUS_KEY,
    queryFn: fetchStatus,
    enabled,
    staleTime: 60_000,
    retry: false,
    refetchInterval: (q) => (q.state.data === null ? NOT_ON_SERVER_EVERY : false),
  });
}

/**
 * True once the API has integrations and the club has something there
 * (API access, or a partner app it connected); false when it hasn't, or
 * the question failed; undefined while asking.
 */
export function useIntegrationsOnServer(enabled = true): boolean | undefined {
  const q = useIntegrationsStatus(enabled);
  if (!enabled) return false;
  if (q.isError) return false;
  if (q.data === undefined) return undefined;
  return integrationsVisible(q.data);
}

function useRefresh() {
  const queryClient = useQueryClient();
  return (...keys: (readonly unknown[])[]) => {
    for (const key of keys) void queryClient.invalidateQueries({ queryKey: key });
  };
}

// ─── Keys ────────────────────────────────────────────────────────────────

export function useApiKeys(enabled = true) {
  return useQuery({ queryKey: KEYS_KEY, queryFn: fetchKeys, enabled, staleTime: 15_000, retry: false });
}

/** Makes a key. The key itself comes back once, to the caller: nothing here keeps it. */
export function useCreateKey() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: CreateKeyBody) => createKey(body),
    onSuccess: () => refresh(KEYS_KEY, STATUS_KEY),
    onError: toastError,
  });
}

export function useRotateKey() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (keyId: string) => rotateKey(keyId),
    onSuccess: () => refresh(KEYS_KEY),
    onError: toastError,
  });
}

export function useRevokeKey() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (keyId: string) => revokeKey(keyId),
    onSuccess: () => {
      toast.success("Key revoked. Anything still using it is refused from now on.");
      refresh(KEYS_KEY, STATUS_KEY);
    },
    onError: toastError,
  });
}

// ─── Webhooks ────────────────────────────────────────────────────────────

/** Whether webhooks can be used now (the server has its signing key, the club its access). */
export function useWebhookStatus(enabled = true) {
  return useQuery({ queryKey: [...ENDPOINTS_KEY, "status"], queryFn: fetchWebhookStatus, enabled, staleTime: 60_000, retry: false });
}

export function useEndpoints(enabled = true) {
  return useQuery({ queryKey: ENDPOINTS_KEY, queryFn: fetchEndpoints, enabled, staleTime: 15_000, retry: false });
}

export function useCreateEndpoint() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: EndpointBody) => createEndpoint(body),
    onSuccess: () => refresh(ENDPOINTS_KEY),
    onError: toastError,
  });
}

export function useUpdateEndpoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ endpoint, body }: { endpoint: Endpoint; body: Partial<Pick<EndpointBody, "events" | "include_own_changes" | "description">> & { enabled?: boolean } }) => updateEndpoint(endpoint.id, body),
    onSuccess: (next, { body }) => {
      queryClient.setQueryData<Endpoint[]>(ENDPOINTS_KEY, (list) => list?.map((e) => (e.id === next.id ? next : e)));
      if (body.enabled === true) toast.success("Turned on. Changes are sent to it again.");
      else if (body.enabled === false) toast.success("Turned off. Nothing is sent to it until you turn it on.");
      else toast.success("Saved");
    },
    onError: toastError,
  });
}

export function useDeleteEndpoint() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (endpointId: string) => deleteEndpoint(endpointId),
    onSuccess: () => {
      toast.success("Endpoint removed. Nothing more is sent to it.");
      refresh(ENDPOINTS_KEY);
    },
    onError: toastError,
  });
}

export function useRotateEndpointSecret() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (endpointId: string) => rotateEndpointSecret(endpointId),
    onSuccess: () => refresh(ENDPOINTS_KEY),
    onError: toastError,
  });
}

/** Sends a test change; the toast says what the endpoint answered. */
export function useTestEndpoint() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (endpointId: string) => testEndpoint(endpointId),
    onSuccess: (d, endpointId) => {
      const said = deliveryOutcome(d);
      if (said.ok) toast.success(`Test sent. ${said.text}`);
      else toast.error(`Test sent. ${said.text}`);
      refresh(ENDPOINTS_KEY, [...ENDPOINTS_KEY, endpointId]);
    },
    onError: toastError,
  });
}

/** An endpoint's delivery log, newest first, a page at a time. */
export function useDeliveries(endpointId: string | null, status?: string) {
  return useInfiniteQuery({
    queryKey: deliveriesKey(endpointId ?? "", status),
    queryFn: ({ pageParam }) => fetchDeliveries(endpointId!, { status, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor ?? null,
    enabled: Boolean(endpointId),
    staleTime: 10_000,
    retry: false,
  });
}

/** Sends a delivery again (a replay): the same event id, so a receiver that had it can tell. */
export function useRetryDelivery(endpointId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (deliveryId: string) => retryDelivery(deliveryId),
    onSuccess: (d) => {
      const said = deliveryOutcome(d);
      if (said.ok) toast.success(`Sent again. ${said.text}`);
      else toast.error(`Sent again. ${said.text}`);
      refresh([...ENDPOINTS_KEY, endpointId], ENDPOINTS_KEY);
    },
    onError: toastError,
  });
}

// ─── Connected apps ──────────────────────────────────────────────────────

export function useConnections(enabled = true) {
  return useQuery({ queryKey: APPS_KEY, queryFn: fetchConnections, enabled, staleTime: 15_000, retry: false });
}

export function useDisconnectPartner() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (c: Connection) => disconnectApp(c.id),
    onSuccess: (_r, c) => {
      toast.success(`${c.partner.name} disconnected. It can't reach the club any more.`);
      refresh(APPS_KEY, STATUS_KEY, ENDPOINTS_KEY);
    },
    onError: toastError,
  });
}

// ─── Usage ───────────────────────────────────────────────────────────────

export function useUsage(enabled = true) {
  return useQuery({ queryKey: [...INTEGRATIONS_KEY, "usage", 30], queryFn: () => fetchUsage(30), enabled, staleTime: 5 * 60_000, retry: false });
}

// ─── Consent ─────────────────────────────────────────────────────────────

/** What a partner app asks for. Not retried: a 400 or 403 is an answer, not a blip. */
export function useConsent(params: OAuthParams) {
  return useQuery({ queryKey: [...INTEGRATIONS_KEY, "consent", params], queryFn: () => fetchConsent(params), retry: false, staleTime: 30_000 });
}

/** Leaving the dashboard for the partner app (a seam, so tests can watch it without a navigation). */
export const browser = { go: (url: string) => window.location.assign(url) };

export function useDecideConsent(params: OAuthParams) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: ConsentDecision) => decideConsent(params, body),
    onSuccess: () => refresh(APPS_KEY, STATUS_KEY),
  });
}
