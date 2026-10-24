import { api } from "@moa/app-kit";

import { clubAlertsSchema } from "./schemas";

/** GET /clubs/alerts: the club's notices, newest first, and how many are unread. */
export async function fetchClubAlerts() {
  return clubAlertsSchema.parse(await api.get<unknown>("/api/v1/clubs/alerts"));
}

/** POST /clubs/alerts/read: these notices read, or every one when `ids` is left out. */
export async function markClubAlertsRead(ids?: number[]) {
  return api.post<{ marked: number }>("/api/v1/clubs/alerts/read", ids?.length ? { ids } : {});
}
