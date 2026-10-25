import { z } from "zod";

const money = z.coerce.number().catch(0);
const count = z.number().int().catch(0);

/** A cancellation refund Razorpay has not taken (yet): listed to try again. */
export const cancelFailureSchema = z.object({
  id: z.string(),
  registration_id: z.string().nullable().catch(null),
  full_name: z.string().nullable().catch(null),
  email: z.string().nullable().catch(null),
  amount: money,
  error: z.string().nullable().catch(null),
  attempts: count,
  gateway: z.enum(["platform", "club"]).catch("platform"),
});
export type CancelFailure = z.infer<typeof cancelFailureSchema>;

/**
 * GET /events/{id}/cancel: before cancelling, what it would do (the confirm
 * step's counts); after, how the notices and refunds went.
 */
export const cancelStateSchema = z.object({
  status: z.string().catch("published"),
  cancelled: z.boolean().catch(false),
  reason: z.string().nullable().catch(null),
  cancelled_at: z.string().nullable().catch(null),
  cancelled_by: z.string().nullable().catch(null),
  can_cancel: z.boolean().catch(false),
  blocked_reason: z.string().nullable().catch(null),
  registrations: count,
  paid_online: count,
  refund_total: money,
  paid_at_door: count,
  paid_at_door_total: money,
  refunds: z
    .object({ total: count, succeeded: count, pending: count, failed: count, refunded_amount: money })
    .catch({ total: 0, succeeded: 0, pending: 0, failed: 0, refunded_amount: 0 }),
  failures: z.array(cancelFailureSchema).default([]),
  notice: z
    .object({
      email_message_id: z.string().nullable().catch(null),
      push_sent: z.number().nullable().catch(null),
      whatsapp_sent: count,
      whatsapp_skipped: count,
    })
    .nullable()
    .catch(null),
});
export type CancelState = z.infer<typeof cancelStateSchema>;

export const REASON_MIN = 5;
export const REASON_MAX = 500;
export const CANCEL_PREVIEW_STALE = "CANCEL_PREVIEW_STALE";
export const CANNOT_CANCEL = "CANNOT_CANCEL";
