import { z } from "zod";

export const DISPUTE_TABS = ["open", "closed", "all"] as const;
export type DisputeTab = (typeof DISPUTE_TABS)[number];

export const disputeNoteSchema = z.object({
  at: z.string().nullish(),
  by_id: z.number().nullish(),
  by_name: z.string().nullish(),
  text: z.string(),
});
export type DisputeNote = z.infer<typeof disputeNoteSchema>;

export const disputeSchema = z.object({
  id: z.number(),
  razorpay_dispute_id: z.string(),
  razorpay_payment_id: z.string().nullish(),
  payment_log_id: z.string().nullish(),
  subscription_charge_id: z.number().nullish(),
  kind: z.string().catch("unknown"),
  amount: z.coerce.number().catch(0),
  amount_deducted: z.coerce.number().catch(0),
  currency: z.string().catch("INR"),
  reason_code: z.string().nullish(),
  reason: z.string().nullish(),
  phase: z.string().nullish(),
  status: z.string(),
  is_open: z.boolean().catch(false),
  respond_by: z.string().nullish(),
  overdue: z.boolean().catch(false),
  opened_at: z.string().nullish(),
  closed_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  last_event: z.string().nullish(),
  club: z.object({ id: z.number(), name: z.string(), slug: z.string().nullish() }).nullish(),
  event: z.object({ id: z.number().nullish(), name: z.string().nullish() }).nullish(),
  notes: z.array(disputeNoteSchema).catch([]),
});
export type Dispute = z.infer<typeof disputeSchema>;

export const disputePageSchema = z.object({
  items: z.array(disputeSchema),
  total: z.number().catch(0),
  open: z.number().catch(0),
  offset: z.number().catch(0),
  limit: z.number().catch(50),
});
export type DisputePage = z.infer<typeof disputePageSchema>;

export const STATUS_TONE: Record<string, "warning" | "info" | "success" | "destructive" | "default"> = {
  open: "warning",
  action_required: "destructive",
  under_review: "info",
  won: "success",
  lost: "destructive",
  closed: "default",
};

export function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

export function kindLabel(kind: string): string {
  if (kind === "ticket") return "Ticket payment";
  if (kind === "subscription") return "Plan charge";
  return "Payment";
}
