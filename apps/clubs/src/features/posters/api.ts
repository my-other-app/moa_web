import { api } from "@moa/app-kit";

import { type PosterSettingsPatch, posterSettingsSchema, posterStatsSchema } from "./schemas";

const base = (eventId: number) => `/api/v1/events/${eventId}/posters`;

/** The event's poster settings (the defaults when never saved). */
export async function fetchPosterSettings(eventId: number) {
  return posterSettingsSchema.parse(await api.get<unknown>(`${base(eventId)}/settings`));
}

/** Change any part of them; answers the settings as saved. */
export async function savePosterSettings(eventId: number, patch: PosterSettingsPatch) {
  return posterSettingsSchema.parse(await api.put<unknown>(`${base(eventId)}/settings`, patch));
}

/** Posters made, shared, the links' clicks and the registrations they brought. */
export async function fetchPosterStats(eventId: number) {
  return posterStatsSchema.parse(await api.get<unknown>(`${base(eventId)}/stats`));
}
