import { networkingStatsSchema } from "@moa/api";
import { api } from "@moa/app-kit";

/** One event's networking, in counts only (owner, admin, editor and door staff may read it). */
export async function fetchNetworkingStats(eventId: number) {
  const raw = await api.get<unknown>(`/api/v1/events/${eventId}/networking/stats`);
  return networkingStatsSchema.parse(raw);
}
