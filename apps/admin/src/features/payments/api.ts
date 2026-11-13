import { api } from "@moa/app-kit";

import { paymentPageSchema, paymentTotalsSchema } from "./schemas";

export interface PaymentQuery {
  status?: string | undefined;
  search?: string | undefined;
  userId?: number | undefined;
  /** "club" or "platform": whose Razorpay took it. */
  gateway?: string | undefined;
  /** date (newest first), amount or status; unset: date. */
  sort?: string | undefined;
  order?: "asc" | "desc" | undefined;
  offset: number;
  limit: number;
}

export async function fetchPayments(query: PaymentQuery) {
  const raw = await api.get<unknown>("/api/v1/payments/admin/list", {
    query: {
      status: query.status,
      search: query.search,
      user_id: query.userId,
      gateway: query.gateway,
      sort: query.sort,
      order: query.order,
      offset: query.offset,
      limit: query.limit,
    },
  });
  return paymentPageSchema.parse(raw);
}

export async function fetchPaymentTotals() {
  const raw = await api.get<unknown>("/api/v1/payments/admin/totals");
  return paymentTotalsSchema.parse(raw);
}

/** Full refund only — the service refuses a partial one. */
export async function refundPayment(paymentId: string): Promise<void> {
  await api.post<void>(`/api/v1/payments/logs/${paymentId}/refund`);
}
