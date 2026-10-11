import { z } from "zod";

export const DELIVERY_STATUSES = ["pending", "sent", "failed", "skipped"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const DELIVERY_OUTCOMES = ["delivered", "read", "undelivered", "bounced", "complained"] as const;
export type DeliveryOutcome = (typeof DELIVERY_OUTCOMES)[number];

/** One channel's state for one guest, as the attendee list carries it. */
export const deliveryBriefSchema = z.object({
  channel: z.string(),
  status: z.enum(DELIVERY_STATUSES),
  error: z.string().nullish(),
  outcome: z.enum(DELIVERY_OUTCOMES).nullish(),
  reason: z.string().nullish(),
  attempts: z.number().default(0),
  sent_at: z.string().nullish(),
});
export type DeliveryBrief = z.infer<typeof deliveryBriefSchema>;

export const sendResponseSchema = z.object({
  queued: z.number(),
  already_sent: z.number(),
  revoked: z.number(),
  channels: z.array(z.string()),
});
export type SendResponse = z.infer<typeof sendResponseSchema>;

export const ticketStateSchema = z.object({
  registration_id: z.string(),
  ticket_id: z.string(),
  revoked_at: z.string().nullish(),
});

export const providerSchema = z.object({ channel: z.string(), name: z.string(), configured: z.boolean(), note: z.string() });
export type ChannelProvider = z.infer<typeof providerSchema>;

export const deliverySummarySchema = z.object({
  kind: z.string(),
  registrations: z.number(),
  revoked: z.number(),
  /** Which channels have a provider behind them; one without sends nothing and says so. */
  providers: z.array(providerSchema).default([]),
  channels: z.array(
    z.object({
      channel: z.string(),
      sent: z.number(),
      failed: z.number(),
      skipped: z.number(),
      pending: z.number(),
      unsent: z.number(),
    })
  ),
});
export type DeliverySummary = z.infer<typeof deliverySummarySchema>;

export const certificateSummarySchema = z.object({
  issued: z.number(),
  revoked: z.number(),
  attended: z.number(),
  registrations: z.number(),
  outdated: z.number(),
  design_version: z.number(),
  channels: deliverySummarySchema.shape.channels,
});
export type CertificateSummary = z.infer<typeof certificateSummarySchema>;

export const deliveryLogRowSchema = z.object({
  id: z.string(),
  registration_id: z.string(),
  ticket_id: z.string(),
  name: z.string(),
  address: z.string().nullish(),
  kind: z.string(),
  /** A message's subject; nothing for a ticket or certificate. */
  what: z.string().nullish(),
  channel: z.string(),
  status: z.enum(DELIVERY_STATUSES),
  outcome: z.enum(DELIVERY_OUTCOMES).nullish(),
  reason: z.string().nullish(),
  attempts: z.number().default(0),
  sent_at: z.string().nullish(),
  outcome_at: z.string().nullish(),
});
export type DeliveryLogRow = z.infer<typeof deliveryLogRowSchema>;

export const deliveryLogSchema = z.object({
  items: z.array(deliveryLogRowSchema),
  total: z.number(),
  page: z.number(),
  page_size: z.number(),
  tally: z.object({
    sent: z.number(),
    delivered: z.number(),
    awaiting: z.number(),
    bounced: z.number(),
    complained: z.number(),
    failed: z.number(),
    skipped: z.number(),
    pending: z.number(),
  }),
});
export type DeliveryLog = z.infer<typeof deliveryLogSchema>;

/** What became of one send, in a word a person can act on. */
export const verdictOf = (d: { status: DeliveryStatus; outcome?: DeliveryOutcome | null }) => {
  switch (d.outcome) {
    case "delivered":
      return { label: "Delivered", tone: "success" } as const;
    case "read":
      return { label: "Read", tone: "success" } as const;
    case "bounced":
      return { label: "Bounced", tone: "destructive" } as const;
    case "complained":
      return { label: "Marked as spam", tone: "destructive" } as const;
    case "undelivered":
      return { label: "Not delivered", tone: "warning" } as const;
    default:
      break;
  }
  if (d.status === "failed") return { label: "Refused", tone: "destructive" } as const;
  if (d.status === "skipped") return { label: "Skipped", tone: "default" } as const;
  if (d.status === "pending") return { label: "Queued", tone: "info" } as const;
  // Handed to the provider and nothing heard since. Not the same as arrived.
  return { label: "Sent", tone: "info" } as const;
};
