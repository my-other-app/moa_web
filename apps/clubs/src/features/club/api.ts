import { api } from "@moa/app-kit";

import { clubSelfSchema, type ClubProfileForm, type ClubSelf } from "./schemas";

export async function fetchMyClub(): Promise<ClubSelf> {
  const raw = await api.get<unknown>("/api/v1/clubs/info");
  return clubSelfSchema.parse(raw);
}

/**
 * PUT /clubs/update is multipart (it shares a handler with logo upload), so
 * the payload goes as FormData. Empty strings are sent rather than omitted so
 * clearing a field actually clears it server-side.
 */
export async function updateMyClub(input: ClubProfileForm): Promise<void> {
  const form = new FormData();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) form.append(key, value);
  }
  await api.put<void>("/api/v1/clubs/update", form);
}

export async function updateClubLogo(file: File): Promise<void> {
  const form = new FormData();
  form.append("logo", file);
  await api.put<void>("/api/v1/clubs/logo", form);
}
