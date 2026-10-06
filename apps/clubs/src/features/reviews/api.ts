import { api } from "@moa/app-kit";

import { reviewPageSchema, type ReviewPage } from "./schemas";

export async function fetchEventReviews(
  eventId: number,
  query: { offset: number; limit: number }
): Promise<ReviewPage> {
  const raw = await api.get<unknown>(`/api/v1/events/ratings/${eventId}`, {
    query: { offset: query.offset, limit: query.limit },
  });
  return reviewPageSchema.parse(raw);
}
