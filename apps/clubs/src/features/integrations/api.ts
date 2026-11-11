import { api } from "@moa/app-kit";

import {
  connectionsSchema,
  consentDecisionSchema,
  consentSchema,
  deliveriesSchema,
  deliverySchema,
  endpointSchema,
  endpointWithSecretSchema,
  endpointsSchema,
  isIntegrationsMissing,
  isNotAllowed,
  keyWithSecretSchema,
  keysSchema,
  statusSchema,
  usageSchema,
  type CreateKeyBody,
} from "./schemas";

/**
 * Every route the club dashboard's integrations use, in one place: where the
 * backend lands on a different shape, this is the one file to change.
 * Recorded in feature-register/integrations-api-contract.md, "Changes"
 * (12 Nov, proposed by the dashboard), through the gateway:
 *
 *   GET    /clubs/integrations                                  {allocated, can_manage, rate_tier, rate_limit, max_keys, keys_active, apps_connected}
 *   GET    /clubs/integrations/keys                             {items: [key]}
 *   POST   /clubs/integrations/keys                             {name, mode, scopes, expires_at, ip_allowlist, attendees_notice_ack} → {key, secret}
 *   POST   /clubs/integrations/keys/{id}/rotate                 {key, secret}: the old secret stops working
 *   DELETE /clubs/integrations/keys/{id}                        revoke; the row stays, with revoked_at
 *   GET    /clubs/integrations/webhooks                         {items: [endpoint]}
 *   POST   /clubs/integrations/webhooks                         {url, description, events, include_own_changes} → {endpoint, secret}
 *   PATCH  /clubs/integrations/webhooks/{id}                    {enabled?, events?, include_own_changes?, description?} → endpoint
 *   DELETE /clubs/integrations/webhooks/{id}
 *   POST   /clubs/integrations/webhooks/{id}/rotate-secret      {endpoint, secret}
 *   POST   /clubs/integrations/webhooks/{id}/test               delivery
 *   GET    /clubs/integrations/webhooks/{id}/deliveries         ?status=&cursor=&limit= → {items: [delivery], next_cursor}
 *   POST   /clubs/integrations/webhooks/deliveries/{id}/retry   delivery (a replay)
 *   GET    /clubs/integrations/apps                             {items: [connection]}
 *   DELETE /clubs/integrations/apps/{id}                        disconnect: its tokens end at once
 *   GET    /clubs/integrations/usage?days=30                    {days: [{date, requests, errors}]}
 *   GET    /clubs/integrations/consent/{request}                what a partner app asks for
 *   POST   /clubs/integrations/consent/{request}                {decision, scopes, attendees_notice_ack} → {redirect_to}
 */
export const BASE = "/api/v1/clubs/integrations";
const id = (v: string) => encodeURIComponent(v);

/**
 * The club's access. `null` when there is nothing to show: an API from
 * before integrations, a club the MyOtherApp team hasn't allocated, or a
 * role that may not look.
 */
export async function fetchStatus() {
  try {
    return statusSchema.parse(await api.get<unknown>(BASE));
  } catch (error) {
    if (isIntegrationsMissing(error) || isNotAllowed(error)) return null;
    throw error;
  }
}

export async function fetchKeys() {
  return keysSchema.parse(await api.get<unknown>(`${BASE}/keys`)).items;
}

export async function createKey(body: CreateKeyBody) {
  return keyWithSecretSchema.parse(await api.post<unknown>(`${BASE}/keys`, body));
}

export async function rotateKey(keyId: string) {
  return keyWithSecretSchema.parse(await api.post<unknown>(`${BASE}/keys/${id(keyId)}/rotate`));
}

export async function revokeKey(keyId: string) {
  await api.del<unknown>(`${BASE}/keys/${id(keyId)}`);
}

export async function fetchEndpoints() {
  return endpointsSchema.parse(await api.get<unknown>(`${BASE}/webhooks`)).items;
}

export interface EndpointBody {
  url: string;
  description: string | null;
  events: string[];
  include_own_changes: boolean;
}

export async function createEndpoint(body: EndpointBody) {
  return endpointWithSecretSchema.parse(await api.post<unknown>(`${BASE}/webhooks`, body));
}

export async function updateEndpoint(endpointId: string, body: Partial<EndpointBody & { enabled: boolean }>) {
  return endpointSchema.parse(await api.patch<unknown>(`${BASE}/webhooks/${id(endpointId)}`, body));
}

export async function deleteEndpoint(endpointId: string) {
  await api.del<unknown>(`${BASE}/webhooks/${id(endpointId)}`);
}

export async function rotateEndpointSecret(endpointId: string) {
  return endpointWithSecretSchema.parse(await api.post<unknown>(`${BASE}/webhooks/${id(endpointId)}/rotate-secret`));
}

export async function testEndpoint(endpointId: string) {
  return deliverySchema.parse(await api.post<unknown>(`${BASE}/webhooks/${id(endpointId)}/test`));
}

export async function fetchDeliveries(endpointId: string, query: { status?: string | undefined; cursor?: string | null | undefined; limit?: number }) {
  return deliveriesSchema.parse(
    await api.get<unknown>(`${BASE}/webhooks/${id(endpointId)}/deliveries`, {
      query: { status: query.status, cursor: query.cursor ?? undefined, limit: query.limit ?? 25 },
    }),
  );
}

export async function retryDelivery(deliveryId: string) {
  return deliverySchema.parse(await api.post<unknown>(`${BASE}/webhooks/deliveries/${id(deliveryId)}/retry`));
}

export async function fetchConnections() {
  return connectionsSchema.parse(await api.get<unknown>(`${BASE}/apps`)).items;
}

export async function disconnectApp(connectionId: string) {
  await api.del<unknown>(`${BASE}/apps/${id(connectionId)}`);
}

export async function fetchUsage(days = 30) {
  return usageSchema.parse(await api.get<unknown>(`${BASE}/usage`, { query: { days } }));
}

export async function fetchConsent(requestId: string) {
  return consentSchema.parse(await api.get<unknown>(`${BASE}/consent/${id(requestId)}`));
}

export interface ConsentBody {
  decision: "allow" | "deny";
  scopes: string[];
  attendees_notice_ack: boolean;
}

export async function decideConsent(requestId: string, body: ConsentBody) {
  return consentDecisionSchema.parse(await api.post<unknown>(`${BASE}/consent/${id(requestId)}`, body));
}
