import { api } from "@moa/app-kit";

import { clubWhatsAppSchema } from "./schemas";

export async function fetchClubWhatsApp(clubId: number) {
  return clubWhatsAppSchema.parse(await api.get<unknown>(`/api/v1/admin/club-whatsapp/${clubId}`));
}
