import { api } from "@moa/app-kit";

import {
  connectionsSchema,
  consentDecisionSchema,
  consentSchema,
  deliveriesSchema,
  docsLinkCreatedSchema,
  docsLinksSchema,
  endpointSchema,
  endpointWithSecretSchema,
  endpointsSchema,
  isIntegrationsMissing,
  isNotAllowed,
  keyWithSecretSchema,
  keysSchema,
  sentSchema,
  statusSchema,
  usageSchema,
  webhookStatusSchema,
  type CreateKeyBody,
  type DocsLinkBody,
  type EndpointBody,
  type OAuthParams,
} from "./schemas";

/**
 * Every route the club dashboard's integrations use, in one place: where the
 * backend lands on a different shape, this is the one file to change. These
 * are the backend's own (feat/partner-api app/api/partner/club_router.py,
 * feat/api-webhooks app/api/webhooks_out/router.py), through the gateway,
 * owners and admins only:
 *
 *   GET    /clubs/integrations                                 {allocated, source, rate_tier, rate_limit, max_keys, live_keys, scopes, disclosure, docs_url}
 *   GET    /clubs/integrations/keys?include_revoked=true       {keys: [key]}
 *   POST   /clubs/integrations/keys                            {name, mode, scopes, expires_at, ip_allowlist, attendees_disclosure_ack} → key + secret
 *   POST   /clubs/integrations/keys/{id}/rotate                key + secret: the old secret stops now
 *   DELETE /clubs/integrations/keys/{id}                       revoke
 *   GET    /clubs/integrations/connected-apps                  {apps: [connection]}
 *   DELETE /clubs/integrations/connected-apps/{id}             disconnect: its tokens end now
 *   GET    /clubs/integrations/usage?days=30                   {days: [{day, requests, errors, …}], clients}
 *   GET    /clubs/integrations/connect?<the OAuth request>     what a partner app asks for, checked
 *   POST   /clubs/integrations/connect                         the OAuth request + {decision, scopes, attendees_disclosure_ack} → {redirect_to}
 *   GET    /clubs/integrations/webhooks/status                 {available, reason, message, max_endpoints, event_types}
 *   GET    /clubs/integrations/webhooks                        {data: [endpoint], next_cursor}
 *   POST   /clubs/integrations/webhooks                        {url, description, events, livemode, include_own_changes, share_attendee_details, dpdp_confirmed, client_id?} → endpoint + secret
 *   PATCH  /clubs/integrations/webhooks/{id}                   {enabled?, events?, …} → endpoint
 *   DELETE /clubs/integrations/webhooks/{id}                   204
 *   POST   /clubs/integrations/webhooks/{id}/rotate-secret     endpoint + secret (the old one also signs for a day)
 *   POST   /clubs/integrations/webhooks/{id}/test              {ok, delivery}
 *   GET    /clubs/integrations/webhooks/{id}/deliveries        ?status=&cursor=&limit= → {data: [delivery], next_cursor}
 *   POST   /clubs/integrations/webhooks/deliveries/{id}/retry  {ok, delivery} (a replay)
 *   GET    /clubs/integrations/docs-links                      {links: [link]} newest first, ended ones for 30 days
 *   POST   /clubs/integrations/docs-links                      {purpose: "self"|"share", label?} → {link, url}: the url once
 *   DELETE /clubs/integrations/docs-links/{id}                 {revoked: true}
 */
export const BASE = "/api/v1/clubs/integrations";
const HOOKS = `${BASE}/webhooks`;
const DOCS = `${BASE}/docs-links`;
const id = (v: string) => encodeURIComponent(v);

/**
 * The club's access. `null` when there is nothing to show: an API from
 * before integrations, or a role that may not look (editors and door staff
 * are refused: 403).
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
  return keysSchema.parse(await api.get<unknown>(`${BASE}/keys`, { query: { include_revoked: true } }));
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

/** Whether webhooks can be used now; `null` on an API without them. */
export async function fetchWebhookStatus() {
  try {
    return webhookStatusSchema.parse(await api.get<unknown>(`${HOOKS}/status`));
  } catch (error) {
    if (isIntegrationsMissing(error)) return null;
    throw error;
  }
}

export async function fetchEndpoints() {
  return endpointsSchema.parse(await api.get<unknown>(HOOKS));
}

export async function createEndpoint(body: EndpointBody) {
  return endpointWithSecretSchema.parse(await api.post<unknown>(HOOKS, body));
}

export async function updateEndpoint(endpointId: string, body: Partial<Pick<EndpointBody, "events" | "include_own_changes" | "description">> & { enabled?: boolean }) {
  return endpointSchema.parse(await api.patch<unknown>(`${HOOKS}/${id(endpointId)}`, body));
}

export async function deleteEndpoint(endpointId: string) {
  await api.del<unknown>(`${HOOKS}/${id(endpointId)}`);
}

export async function rotateEndpointSecret(endpointId: string) {
  return endpointWithSecretSchema.parse(await api.post<unknown>(`${HOOKS}/${id(endpointId)}/rotate-secret`));
}

export async function testEndpoint(endpointId: string) {
  return sentSchema.parse(await api.post<unknown>(`${HOOKS}/${id(endpointId)}/test`));
}

export async function fetchDeliveries(endpointId: string, query: { status?: string | undefined; cursor?: string | null | undefined; limit?: number }) {
  return deliveriesSchema.parse(
    await api.get<unknown>(`${HOOKS}/${id(endpointId)}/deliveries`, {
      query: { status: query.status, cursor: query.cursor ?? undefined, limit: query.limit ?? 25 },
    }),
  );
}

export async function retryDelivery(deliveryId: string) {
  return sentSchema.parse(await api.post<unknown>(`${HOOKS}/deliveries/${id(deliveryId)}/retry`));
}

export async function fetchConnections() {
  return connectionsSchema.parse(await api.get<unknown>(`${BASE}/connected-apps`));
}

export async function disconnectApp(connectionId: string) {
  await api.del<unknown>(`${BASE}/connected-apps/${id(connectionId)}`);
}

export async function fetchUsage(days = 30) {
  return usageSchema.parse(await api.get<unknown>(`${BASE}/usage`, { query: { days } }));
}

/** The partner's request, checked again by the API; the person may only see it once signed in to a club. */
export async function fetchConsent(params: OAuthParams) {
  return consentSchema.parse(await api.get<unknown>(`${BASE}/connect`, { query: params }));
}

export interface ConsentDecision {
  decision: "allow" | "deny";
  scopes: string[];
  attendees_disclosure_ack: boolean;
}

export async function decideConsent(params: OAuthParams, body: ConsentDecision) {
  return consentDecisionSchema.parse(await api.post<unknown>(`${BASE}/connect`, { ...params, ...body }));
}

/**
 * The club's links to the private developer docs. `null` on an API without
 * them, and for a club or role that may not make them (403), so the card
 * stays out of sight.
 */
export async function fetchDocsLinks() {
  try {
    return docsLinksSchema.parse(await api.get<unknown>(DOCS));
  } catch (error) {
    if (isIntegrationsMissing(error) || isNotAllowed(error)) return null;
    throw error;
  }
}

/** A new link. The link itself comes back once, to the caller: nothing here keeps it. */
export async function createDocsLink(body: DocsLinkBody) {
  return docsLinkCreatedSchema.parse(await api.post<unknown>(DOCS, body));
}

export async function revokeDocsLink(linkId: string) {
  await api.del<unknown>(`${DOCS}/${id(linkId)}`);
}
