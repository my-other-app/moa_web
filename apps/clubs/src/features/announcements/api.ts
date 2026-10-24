import { api } from "@moa/app-kit";

import {
  pushAudienceSchema,
  pushHistoryPageSchema,
  pushInsightsSchema,
  sendAnnouncementResultSchema,
  type PushScope,
  type SendAnnouncementInput,
} from "./schemas";

/**
 * Pushes a notification to everyone registered for the event. There is no
 * recall, which is why the UI confirms the recipient count first.
 */
export async function sendAnnouncement(eventId: number, input: SendAnnouncementInput): Promise<number> {
  const raw = await api.post<unknown>(`/api/v1/clubs/notifications/events/${eventId}/send`, input);
  const result = sendAnnouncementResultSchema.parse(raw ?? {});
  // The endpoint says no with a 200: no registrants, or nobody with the app
  // installed. That reason is the whole answer, so it becomes the error.
  if (!result.success) throw new Error(result.message || "The announcement could not be sent");
  return result.notifications_sent ?? 0;
}

export async function fetchPushHistory(params: { scope: PushScope; search?: string | undefined; offset: number; limit: number }) {
  return pushHistoryPageSchema.parse(await api.get<unknown>("/api/v1/clubs/notifications/page", { query: params }));
}

export async function fetchPushInsights() {
  return pushInsightsSchema.parse(await api.get<unknown>("/api/v1/clubs/notifications/insights"));
}

/** What a send to this event would reach, by audience, before it goes. */
export async function fetchPushAudience(eventId: number) {
  return pushAudienceSchema.parse(await api.get<unknown>(`/api/v1/clubs/notifications/events/${eventId}/audience`));
}
