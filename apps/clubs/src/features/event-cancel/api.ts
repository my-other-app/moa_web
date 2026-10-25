import { api } from "@moa/app-kit";

import { cancelStateSchema } from "./schemas";

export async function fetchCancelState(eventId: number) {
  return cancelStateSchema.parse(await api.get<unknown>(`/api/v1/events/${eventId}/cancel`));
}

export interface CancelRequest {
  reason: string;
  /** What the confirm step showed: the server refuses (CANCEL_PREVIEW_STALE) when it no longer holds. */
  expected_registrations?: number;
  expected_refund_total?: number;
}

export async function cancelEvent(eventId: number, body: CancelRequest) {
  return cancelStateSchema.parse(await api.post<unknown>(`/api/v1/events/${eventId}/cancel`, body));
}

/** Every cancellation refund Razorpay did not take, asked for again. */
export async function retryCancelRefunds(eventId: number) {
  return cancelStateSchema.parse(await api.post<unknown>(`/api/v1/events/${eventId}/cancel/retry`, {}));
}
