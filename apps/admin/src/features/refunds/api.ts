import { api } from "@moa/app-kit";

import { chargeRefundResultSchema, refundDetailSchema, type PaymentRefundInput } from "./schemas";

export async function fetchRefundDetail(paymentId: string) {
  return refundDetailSchema.parse(await api.get<unknown>(`/api/v1/admin/refunds/payments/${paymentId}`));
}

export async function refundPaymentPart(paymentId: string, input: PaymentRefundInput) {
  const body: Record<string, unknown> = { kind: input.kind, reason: input.reason };
  if (input.kind === "ticket") body.amount = input.amount;
  if (input.kind === "store_order") body.store_order_id = input.store_order_id;
  return refundDetailSchema.parse(await api.post<unknown>(`/api/v1/admin/refunds/payments/${paymentId}`, body));
}

/** Rupees, or all that is left when `amount` is unset. */
export async function refundCharge(chargeId: number | string, input: { amount?: number | undefined; reason: string }) {
  const body: Record<string, unknown> = { reason: input.reason };
  if (input.amount !== undefined) body.amount = input.amount;
  return chargeRefundResultSchema.parse(await api.post<unknown>(`/api/v1/admin/refunds/subscription-charges/${chargeId}`, body));
}
