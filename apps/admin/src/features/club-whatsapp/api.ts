import { api } from "@moa/app-kit";

import { clubWhatsAppSchema, fallbackClubsSchema } from "./schemas";

export async function fetchClubWhatsApp(clubId: number) {
  return clubWhatsAppSchema.parse(await api.get<unknown>(`/api/v1/admin/club-whatsapp/${clubId}`));
}

export async function fetchFallbackClubs(limit = 10) {
  return fallbackClubsSchema.parse(await api.get<unknown>("/api/v1/admin/club-whatsapp/fallbacks", { query: { limit } }));
}
