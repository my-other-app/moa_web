import { api } from "@moa/app-kit";

import { nullIfAhead } from "@/lib/ahead-of-api";

import { duplicatesSchema, speakerDetailSchema, speakerPageSchema } from "./schemas";

const BASE = "/api/v1/admin/speakers";

export interface SpeakerQuery {
  q?: string | undefined;
  topic?: string | undefined;
  city?: string | undefined;
  clubId?: number | undefined;
  year?: number | undefined;
  status?: string | undefined;
  claimed?: boolean | undefined;
  sort?: string | undefined;
  page: number;
  pageSize: number;
}

const params = (q: Omit<SpeakerQuery, "page" | "pageSize">) => ({ q: q.q, topic: q.topic, city: q.city, club_id: q.clubId, year: q.year, status: q.status, claimed: q.claimed, sort: q.sort });

/**
 * The directory, filtered — and the probe for the whole page: `null` on an
 * API without speakers (a bare 404 or 405), and the menu item hides.
 */
export async function fetchSpeakers(query: SpeakerQuery) {
  return nullIfAhead(async () => speakerPageSchema.parse(await api.get<unknown>(BASE, { query: { ...params(query), page: query.page, page_size: query.pageSize } })));
}

/** The same list as a workbook, with the filters on screen. */
export function speakersExportUrl(query: Omit<SpeakerQuery, "page" | "pageSize">): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params(query))) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  const s = qs.toString();
  return `/api/gateway${BASE}${s ? `?${s}` : ""}`;
}

export async function fetchSpeaker(id: number) {
  return speakerDetailSchema.parse(await api.get<unknown>(`${BASE}/${id}`));
}

export const hideSpeaker = (id: number) => api.post<unknown>(`${BASE}/${id}/hide`);
export const unhideSpeaker = (id: number) => api.post<unknown>(`${BASE}/${id}/unhide`);
/** The speaker asked to be removed: hidden, and every club's email, phone and notes for them deleted. */
export const removeOnRequest = (id: number) => api.post<unknown>(`${BASE}/${id}/remove-on-request`);
/** Takes a merge back: this (merged) profile stands on its own again, with its talks. */
export const unmergeSpeaker = (id: number) => api.post<unknown>(`${BASE}/${id}/unmerge`);
/** The claim email: a link the speaker signs in with to keep their own profile. */
export const inviteSpeaker = (id: number, email: string) => api.post<unknown>(`${BASE}/${id}/invite`, { email });

export async function fetchDuplicates(status: "open" | "merged" | "dismissed" = "open") {
  return duplicatesSchema.parse(await api.get<unknown>(`${BASE}/duplicates`, { query: { status } }));
}

/** One person: `mergeId`'s talks move to `keepId`; undone with unmerge. */
export const mergeSpeakers = (keepId: number, mergeId: number) => api.post<unknown>(`${BASE}/merge`, { keep_id: keepId, merge_id: mergeId });
/** Two different people: the pair leaves the queue. */
export const dismissDuplicate = (candidateId: number) => api.post<unknown>(`${BASE}/duplicates/${candidateId}/dismiss`);
