import { api } from "@moa/app-kit";
import { badgeListSchema, type Badge } from "./schemas";

export async function fetchBadges(): Promise<Badge[]> {
  const raw = await api.get<unknown>("/api/v1/badges/admin");
  return badgeListSchema.parse(raw);
}
