import { api } from "@moa/app-kit";

import { eventPaymentsSchema, refundResultSchema } from "./schemas";

/** Every payment guests made for this event, with the refunds on each. */
export async function fetchEventPayments(eventId: number) {
  return eventPaymentsSchema.parse(await api.get<unknown>(`/api/v1/events/${eventId}/payments`));
}

export interface RefundRequest {
  /** Rupees; left out, everything still refundable goes back. */
  amount?: number;
  reason: string;
  /** One per dialog: the same request sent twice answers with the first refund. */
  client_ref?: string;
}

export async function refundPayment(eventId: number, paymentId: string, body: RefundRequest) {
  return refundResultSchema.parse(await api.post<unknown>(`/api/v1/events/${eventId}/payments/${paymentId}/refund`, body));
}

export async function retryRefund(eventId: number, refundId: string) {
  return refundResultSchema.parse(await api.post<unknown>(`/api/v1/events/${eventId}/refunds/${refundId}/retry`, {}));
}
