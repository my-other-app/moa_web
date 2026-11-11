import { api } from "@moa/app-kit";
import { ApiError } from "@moa/api";

import { clubSpeakerDetailSchema, clubSpeakerPageSchema, contactSchema, suggestionsSchema } from "./schemas";

const BASE = "/api/v1/clubs/speakers";

/**
 * Whether an error means "this API has no speakers directory yet": its bare
 * 404 (FastAPI's own) or a 405. A coded 404 (no such speaker) is not that.
 */
export function isSpeakersMissing(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status === 404) return error.routeMissing;
  return error.status === 405 && error.errorCode === null;
}

async function nullIfMissing<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (isSpeakersMissing(error)) return null;
    throw error;
  }
}

/**
 * The picker's suggestions: the club's own past speakers first, then
 * claimed public profiles by name. `null` on an API without the directory:
 * "Add a speaker" then adds a blank row, as before.
 */
export async function suggestSpeakers(q: string, limit = 8) {
  return nullIfMissing(async () => suggestionsSchema.parse(await api.get<unknown>(BASE, { query: { q: q.trim() || undefined, limit } })));
}

export async function fetchClubSpeakers(q: string, page: number, pageSize: number) {
  return nullIfMissing(async () => clubSpeakerPageSchema.parse(await api.get<unknown>(`${BASE}/list`, { query: { q: q.trim() || undefined, page, page_size: pageSize } })));
}

/** The list as a workbook (`format=xlsx`), with the search on screen. */
export function clubSpeakersExportUrl(q: string): string {
  const qs = new URLSearchParams();
  if (q.trim()) qs.set("q", q.trim());
  const s = qs.toString();
  return `/api/gateway${BASE}/list${s ? `?${s}` : ""}`;
}

export async function fetchClubSpeaker(profileId: number) {
  return clubSpeakerDetailSchema.parse(await api.get<unknown>(`${BASE}/${profileId}`));
}

export interface ContactInput {
  email: string;
  phone: string;
  notes: string;
  /** The speaker agreed to the club keeping their email or phone. */
  consent: boolean;
}

/** The club's own contact for a speaker; empty fields clear what was there. */
export async function saveContact(profileId: number, input: ContactInput) {
  const raw = await api.put<unknown>(`${BASE}/${profileId}/contact`, { email: input.email.trim(), phone: input.phone.trim(), notes: input.notes.trim(), consent: input.consent });
  const contact = (raw as { contact?: unknown } | null)?.contact;
  return contactSchema.nullish().parse(contact ?? null);
}

/** The profile's photo, headline, bio and link copied onto the club's upcoming events (never past ones). */
export async function applyToUpcoming(profileId: number) {
  return (await api.post<{ updated?: number; event_ids?: number[] } | null>(`${BASE}/${profileId}/apply-to-upcoming`)) ?? null;
}
