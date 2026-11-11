import type { Paginated } from "@moa/api";
import { api } from "@moa/app-kit";

import { nullIfAhead } from "@/lib/ahead-of-api";

import {
  allocationListSchema,
  allocationSchema,
  clubDetailSchema,
  partnerAppListSchema,
  partnerAppSchema,
  partnerAppWithSecretSchema,
  partnerDetailSchema,
  usageSchema,
  webhookHealthSchema,
  type Allocation,
  type AllocationBody,
  type PartnerApp,
  type PartnerAppBody,
} from "./schemas";

/**
 * Every route the admin portal's integrations use, in one place: where the
 * backend lands on a different shape, this is the one file to change. These
 * are the backend's own (feat/partner-api app/api/partner/admin_router.py,
 * feat/api-webhooks app/api/webhooks_out/router.py), through the gateway:
 *
 *   GET    /admin/integrations/clubs?enabled=                       {clubs: [allocation]} (every club that has had access)
 *   GET    /admin/integrations/clubs/{club_id}                      allocation + {keys, connected_apps, usage}
 *   PUT    /admin/integrations/clubs/{club_id}                      {enabled, rate_tier, max_keys, notes} → allocation
 *   DELETE /admin/integrations/keys/{key_id}                        revoke a club's key
 *   GET    /admin/integrations/usage?days=30                        {days: [{day, requests, errors, …}], clients}
 *   GET    /admin/integrations/partner-apps                         {apps: [app], scopes}
 *   POST   /admin/integrations/partner-apps                         {name, description, website, logo_url, contact_email, redirect_uris, allowed_scopes, rate_tier} → app + client_secret
 *   GET    /admin/integrations/partner-apps/{id}                    app + {connections}
 *   PATCH  /admin/integrations/partner-apps/{id}                    the same fields → app
 *   POST   /admin/integrations/partner-apps/{id}/rotate-secret      app + client_secret
 *   POST   /admin/integrations/partner-apps/{id}/suspend            {reason?} → app
 *   POST   /admin/integrations/partner-apps/{id}/resume             app
 *   DELETE /admin/integrations/partner-apps/{id}/connections/{cid}  disconnect a club
 *   GET    /admin/integrations/webhooks/health?days=7               {endpoints, per_day, top_clubs_7d, failing_endpoints}
 *   PATCH  /admin/integrations/webhooks/endpoints/{id}              {enabled} → endpoint
 *
 * The two lists come whole (the server caps them at a few hundred), so the
 * search, the filter and the pages are the portal's own.
 */
const BASE = "/api/v1/admin/integrations";
const id = (v: string | number) => encodeURIComponent(String(v));

function page<T>(rows: T[], offset: number, limit: number): Paginated<T> {
  return { items: rows.slice(offset, offset + limit), total: rows.length, limit, offset, next: null };
}

const matches = (text: string | null | undefined, q: string) => (text ?? "").toLowerCase().includes(q);

export interface AllocationQuery {
  status?: string | undefined;
  search?: string | undefined;
  offset: number;
  limit: number;
}

/**
 * Clubs with API access, filtered — and the probe for the whole section:
 * `null` on an API without integrations (a bare 404 or 405), and the menu
 * item hides.
 */
export async function fetchAllocations(query: AllocationQuery): Promise<Paginated<Allocation> | null> {
  return nullIfAhead(async () => {
    const enabled = query.status === "allocated" ? true : query.status === "revoked" ? false : undefined;
    const rows = allocationListSchema.parse(await api.get<unknown>(`${BASE}/clubs`, { query: { enabled } }));
    const q = (query.search ?? "").trim().toLowerCase();
    return page(q ? rows.filter((r) => matches(r.club.name, q) || matches(r.club.slug, q)) : rows, query.offset, query.limit);
  });
}

export async function fetchClubDetail(clubId: number) {
  const raw = await api.get<unknown>(`${BASE}/clubs/${id(clubId)}`);
  return { allocation: allocationSchema.parse(raw), ...clubDetailSchema.parse(raw) };
}

export async function saveAllocation(clubId: number, body: AllocationBody) {
  return allocationSchema.parse(await api.put<unknown>(`${BASE}/clubs/${id(clubId)}`, body));
}

export async function revokeClubKey(keyId: string) {
  await api.del<unknown>(`${BASE}/keys/${id(keyId)}`);
}

export async function fetchPlatformUsage(days = 30) {
  return usageSchema.parse(await api.get<unknown>(`${BASE}/usage`, { query: { days } }));
}

export interface PartnerQuery {
  status?: string | undefined;
  search?: string | undefined;
  offset: number;
  limit: number;
}

export async function fetchPartnerApps(query: PartnerQuery): Promise<Paginated<PartnerApp>> {
  const rows = partnerAppListSchema.parse(await api.get<unknown>(`${BASE}/partner-apps`));
  const q = (query.search ?? "").trim().toLowerCase();
  const kept = rows.filter((a) => (!query.status || a.status === query.status) && (!q || matches(a.name, q) || matches(a.client_id, q)));
  return page(kept, query.offset, query.limit);
}

export async function createPartnerApp(body: PartnerAppBody) {
  return partnerAppWithSecretSchema.parse(await api.post<unknown>(`${BASE}/partner-apps`, body));
}

export async function fetchPartnerApp(appId: string) {
  return partnerDetailSchema.parse(await api.get<unknown>(`${BASE}/partner-apps/${id(appId)}`));
}

export async function updatePartnerApp(appId: string, body: PartnerAppBody) {
  return partnerAppSchema.parse(await api.patch<unknown>(`${BASE}/partner-apps/${id(appId)}`, body));
}

export async function suspendPartnerApp(appId: string, reason: string | null) {
  return partnerAppSchema.parse(await api.post<unknown>(`${BASE}/partner-apps/${id(appId)}/suspend`, { reason }));
}

export async function resumePartnerApp(appId: string) {
  return partnerAppSchema.parse(await api.post<unknown>(`${BASE}/partner-apps/${id(appId)}/resume`));
}

export async function rotatePartnerSecret(appId: string) {
  return partnerAppWithSecretSchema.parse(await api.post<unknown>(`${BASE}/partner-apps/${id(appId)}/rotate-secret`));
}

export async function disconnectPartnerClub(appId: string, connectionId: string) {
  await api.del<unknown>(`${BASE}/partner-apps/${id(appId)}/connections/${id(connectionId)}`);
}

export async function fetchWebhookHealth(days = 7) {
  return webhookHealthSchema.parse(await api.get<unknown>(`${BASE}/webhooks/health`, { query: { days } }));
}

/** Turns any club's endpoint off (or on again); the club sees it turned off by MyOtherApp. */
export async function setEndpointEnabled(endpointId: string, enabled: boolean) {
  await api.patch<unknown>(`${BASE}/webhooks/endpoints/${id(endpointId)}`, { enabled });
}
