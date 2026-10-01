import { api } from "@moa/app-kit";

import {
  announcementHistorySchema,
  type SendAnnouncementInput,
} from "./schemas";

export async function fetchAnnouncementHistory(params: {
  offset: number;
  limit: number;
}) {
  const raw = await api.get<unknown>("/api/v1/clubs/notifications/history", {
    query: { offset: params.offset, limit: params.limit },
  });
  return announcementHistorySchema.parse(raw);
}

/**
 * Pushes a notification to everyone registered for the event. There is no
 * recall, which is why the UI confirms the recipient count first.
 */
export async function sendAnnouncement(
  eventId: number,
  input: SendAnnouncementInput
): Promise<void> {
  await api.post<void>(`/api/v1/clubs/notifications/events/${eventId}/send`, input);
}
