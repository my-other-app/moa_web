import { api } from "@moa/app-kit";
import { z } from "zod";
import {
  orgAnalyticsSchema,
  orgListSchema,
  orgSchema,
  type Org,
  type OrgFormInput,
} from "./schemas";

export async function fetchOrgs(): Promise<Org[]> {
  const raw = await api.get<unknown>("/api/v1/orgs/list");
  return orgListSchema.parse(raw);
}

/**
 * The endpoint used to toggle and ignore this body, which meant that acting
 * on a stale row inverted the result -- and this list is cached for ten
 * minutes. It now reads `is_blocked` and sets it outright, so sending the
 * same value twice is a no-op rather than a flip.
 */
export async function setOrgBlocked(orgId: number, blocked: boolean): Promise<void> {
  await api.put<void>(`/api/v1/orgs/block/${orgId}`, { is_blocked: blocked });
}

export async function fetchOrg(orgId: number): Promise<Org> {
  const raw = await api.get<unknown>(`/api/v1/orgs/${orgId}`);
  return orgSchema.parse(raw);
}

export async function fetchOrgAnalytics(orgId: number) {
  const raw = await api.get<unknown>(`/api/v1/orgs/admin/${orgId}/analytics`);
  return orgAnalyticsSchema.parse(raw);
}

/** Create and update are multipart, because both accept a logo upload. */
function toFormData(input: OrgFormInput, logo?: File | null): FormData {
  const form = new FormData();
  form.append("name", input.name);
  form.append("type", input.type);
  for (const key of ["address", "phone", "email", "website"] as const) {
    const value = input[key];
    // Omitted rather than sent empty: update applies only what it receives,
    // so an empty string would overwrite a real value with a blank one.
    if (value) form.append(key, value);
  }
  if (logo) form.append("logo", logo);
  return form;
}

export async function createOrg(input: OrgFormInput, logo?: File | null): Promise<void> {
  await api.post<void>("/api/v1/orgs/create", toFormData(input, logo));
}

export async function updateOrg(
  orgId: number,
  input: OrgFormInput,
  logo?: File | null
): Promise<void> {
  await api.put<void>(`/api/v1/orgs/update/${orgId}`, toFormData(input, logo));
}

export async function deleteOrg(orgId: number): Promise<void> {
  await api.del<void>(`/api/v1/orgs/delete/${orgId}`);
}

export async function fetchDeletedOrgs(query: { offset: number; limit: number }) {
  const raw = await api.get<unknown>("/api/v1/orgs/deleted/list", {
    query: { offset: query.offset, limit: query.limit },
  });
  return z
    .object({ items: z.array(orgSchema).default([]), total: z.number().nullish() })
    .passthrough()
    .parse(raw);
}

export async function restoreOrg(orgId: number): Promise<void> {
  await api.post<void>(`/api/v1/orgs/${orgId}/restore`);
}
