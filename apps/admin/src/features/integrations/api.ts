import type { Paginated } from "@moa/api";
import { api } from "@moa/app-kit";

import { nullIfAhead } from "@/lib/ahead-of-api";

import {
  allocationPageSchema,
  allocationSchema,
  partnerAppPageSchema,
  partnerAppSchema,
  partnerAppWithSecretSchema,
  partnerClubsSchema,
  usageSchema,
  webhookHealthSchema,
  type Allocation,
  type AllocationBody,
  type PartnerApp,
  type PartnerAppBody,
} from "./schemas";

/**
 * Every route the admin portal's integrations use, in one place: where the
 * backend lands on a different shape, this is the one file to change.
 * Recorded in feature-register/integrations-api-contract.md, "Changes"
 * (12 Nov, proposed by the dashboard), through the gateway:
 *
 *   GET    /admin/integrations/clubs                        ?status=allocated|revoked&q=&offset=&limit= → {items: [allocation], total}
 *   PUT    /admin/integrations/clubs/{club_id}              {allocated, rate_tier, max_keys, notes} → allocation (allocate, change, revoke)
 *   GET    /admin/integrations/clubs/{club_id}/usage        ?days=30 → {days: [{date, requests, errors}]}
 *   GET    /admin/integrations/usage                        ?days=30 → the same, for the whole platform
 *   GET    /admin/integrations/partner-apps                 ?status=&q=&offset=&limit= → {items: [app], total}
 *   POST   /admin/integrations/partner-apps                 {name, logo_url, website, redirect_uris, allowed_scopes} → {app, client_secret}
 *   PATCH  /admin/integrations/partner-apps/{id}            the same fields → app
 *   POST   /admin/integrations/partner-apps/{id}/suspend    app (its tokens stop working at once)
 *   POST   /admin/integrations/partner-apps/{id}/resume     app
 *   POST   /admin/integrations/partner-apps/{id}/rotate-secret  {app, client_secret}
 *   GET    /admin/integrations/partner-apps/{id}/clubs      {items: [{club, scopes, connected_at, connected_by, last_used_at}]}
 *   GET    /admin/integrations/webhooks/health              ?days=7 → {totals, days, endpoints, failing: [...]}
 */
const BASE = "/api/v1/admin/integrations";
const id = (v: string | number) => encodeURIComponent(String(v));

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
    const page = allocationPageSchema.parse(await api.get<unknown>(`${BASE}/clubs`, { query: { status: query.status, q: query.search, offset: query.offset, limit: query.limit } }));
    return { items: page.items, total: page.total, limit: query.limit, offset: query.offset, next: null };
  });
}

export async function saveAllocation(clubId: number, body: AllocationBody) {
  return allocationSchema.parse(await api.put<unknown>(`${BASE}/clubs/${id(clubId)}`, body));
}

export async function fetchClubUsage(clubId: number, days = 30) {
  return usageSchema.parse(await api.get<unknown>(`${BASE}/clubs/${id(clubId)}/usage`, { query: { days } }));
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
  const page = partnerAppPageSchema.parse(await api.get<unknown>(`${BASE}/partner-apps`, { query: { status: query.status, q: query.search, offset: query.offset, limit: query.limit } }));
  return { items: page.items, total: page.total, limit: query.limit, offset: query.offset, next: null };
}

export async function createPartnerApp(body: PartnerAppBody) {
  return partnerAppWithSecretSchema.parse(await api.post<unknown>(`${BASE}/partner-apps`, body));
}

export async function updatePartnerApp(appId: string, body: PartnerAppBody) {
  return partnerAppSchema.parse(await api.patch<unknown>(`${BASE}/partner-apps/${id(appId)}`, body));
}

export async function suspendPartnerApp(appId: string) {
  return partnerAppSchema.parse(await api.post<unknown>(`${BASE}/partner-apps/${id(appId)}/suspend`));
}

export async function resumePartnerApp(appId: string) {
  return partnerAppSchema.parse(await api.post<unknown>(`${BASE}/partner-apps/${id(appId)}/resume`));
}

export async function rotatePartnerSecret(appId: string) {
  return partnerAppWithSecretSchema.parse(await api.post<unknown>(`${BASE}/partner-apps/${id(appId)}/rotate-secret`));
}

export async function fetchPartnerClubs(appId: string) {
  return partnerClubsSchema.parse(await api.get<unknown>(`${BASE}/partner-apps/${id(appId)}/clubs`)).items;
}

export async function fetchWebhookHealth(days = 7) {
  return webhookHealthSchema.parse(await api.get<unknown>(`${BASE}/webhooks/health`, { query: { days } }));
}
