import { paginatedSchema } from "@moa/api";
import { z } from "zod";

/** A count an older server doesn't send: null, never a made-up 0. */
const optionalCount = z
  .number()
  .nullish()
  .catch(null)
  .transform((v) => (v === null || v === undefined ? null : Math.max(0, Math.trunc(v))));

/**
 * Confirm each registration, on a row and on the detail: the event asks
 * people to wait for the club, how many wait now, and how many ever asked.
 * Absent (an older server): off, and the counts unknown.
 */
const approvalShape = {
  requires_approval: z.boolean().catch(false),
  requests_pending: optionalCount,
  requests_total: optionalCount,
};

import { imageFieldSchema, namedRefSchema } from "@moa/app-kit";

export const adminEventSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  poster: imageFieldSchema,
  event_datetime: z.string().nullish(),
  duration: z.number().nullish(),
  location_name: z.string().nullish(),
  has_fee: z.boolean().default(false),
  reg_fee: z.number().nullish(),
  has_prize: z.boolean().default(false),
  prize_amount: z.number().nullish(),
  is_online: z.boolean().nullish(),
  reg_startdate: z.string().nullish(),
  reg_enddate: z.string().nullish(),
  page_views: z.number().nullish(),
  is_deleted: z.boolean().default(false),
  category: namedRefSchema,
  club: namedRefSchema,
  /* How many registered, and how many were marked present. An ended event
     with registrations and nobody present is the row the screen exists to
     surface: certificates and winners are both blocked until the club marks
     attendance. */
  registration_count: z.number().default(0),
  attended_count: z.number().default(0),
  ...approvalShape,
});

export const adminEventPageSchema = paginatedSchema(adminEventSchema);

export type AdminEvent = z.infer<typeof adminEventSchema>;

/**
 * One of an event's own sponsors or partners (backend docs/EVENT_PARTNERS.md).
 * Read-only here; the club adds them in its event editor.
 */
export const eventPartnerSchema = z.object({
  id: z.coerce.number(),
  kind: z.enum(["sponsor", "partner"]).catch("partner"),
  name: z.string(),
  label: z.string().nullish(),
  link: z.string().nullish(),
  position: z.number().catch(0).default(0),
  logo: imageFieldSchema.catch(null),
});
export type EventPartner = z.infer<typeof eventPartnerSchema>;

/** A list an older server doesn't send: empty, so the section stays hidden. */
const partnerList = z.array(eventPartnerSchema).catch([]).default([]);

/** GET /events/info/{id} — the full record, narrowed to what the page shows. */
export const adminEventDetailSchema = z
  .object({
    id: z.coerce.number(),
    name: z.string(),
    slug: z.string().nullish(),
    poster: imageFieldSchema,
    about: z.string().nullish(),
    event_datetime: z.string().nullish(),
    duration: z.coerce.number().nullish(),
    reg_startdate: z.string().nullish(),
    reg_enddate: z.string().nullish(),
    location_name: z.string().nullish(),
    location_link: z.string().nullish(),
    is_online: z.boolean().nullish(),
    url: z.string().nullish(),
    has_fee: z.boolean().default(false),
    reg_fee: z.coerce.number().nullish(),
    has_prize: z.boolean().default(false),
    prize_amount: z.coerce.number().nullish(),
    max_participants: z.coerce.number().nullish(),
    page_views: z.coerce.number().nullish(),
    contact_name: z.string().nullish(),
    contact_phone: z.string().nullish(),
    contact_email: z.string().nullish(),
    event_guidelines: z.string().nullish(),
    category: namedRefSchema,
    club: namedRefSchema,
    ...approvalShape,
    sponsors: partnerList,
    partners: partnerList,
  })
  .passthrough();

/**
 * GET /events/registration/{id}/analytics. Admin-readable since the access
 * rule gained its admin exemption; before that every call 403'd.
 */
export const eventAnalyticsSchema = z
  .object({
    total_registrations: z.number().default(0),
    total_revenue: z.number().default(0),
    attendance_rate: z.number().default(0),
    conversion_rate: z.number().default(0),
    total_institutions: z.number().default(0),
    payment_status: z.record(z.unknown()).nullish(),
    attendance_status: z.record(z.unknown()).nullish(),
    top_institutions: z
      .array(z.object({ name: z.string(), value: z.number() }).passthrough())
      .catch([])
      .default([]),
  })
  .passthrough();

export const eventRegistrationSchema = z.object({
  id: z.string(),
  ticket_id: z.string().nullish(),
  full_name: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  institution: z.string().nullish(),
  is_paid: z.boolean().default(false),
  is_attended: z.boolean().default(false),
  is_won: z.boolean().default(false),
  /** 1 is first place. Null means they did not place. */
  position: z.number().nullish(),
  paid_amount: z.number().nullish(),
  created_at: z.string().nullish(),
});

export const eventRegistrationPageSchema = paginatedSchema(eventRegistrationSchema);

export type AdminEventDetail = z.infer<typeof adminEventDetailSchema>;
export type EventAnalytics = z.infer<typeof eventAnalyticsSchema>;
export type EventRegistration = z.infer<typeof eventRegistrationSchema>;

/** GET /events/categories/list — a flat list, used for the filter dropdown. */
export const eventCategoryListSchema = z.array(
  z
    .object({ id: z.coerce.number(), name: z.string() })
    .passthrough()
);

// ─── Registrations under review (read-only) ─────────────────────────────

/**
 * An event that reviews registrations, as an admin reads it: GET
 * /events/registration/{id}/requests, a page at a time by the server's
 * cursor (`next`), with every status's count. The API still calls them
 * "requests"; the screen uses the club's words (feature-register
 * review-wording-contract.md, section 0). Confirming and declining are the
 * club's: nothing here acts.
 */
export const REVIEW_STATUSES = ["pending", "approved", "declined", "withdrawn", "lapsed", "closed"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
/** One status, or every registration (`status=all`, newest first). */
export type ReviewTab = ReviewStatus | "all";

export const REVIEW_LABEL: Record<ReviewTab, string> = {
  pending: "Under review",
  approved: "Confirmed",
  declined: "Declined",
  withdrawn: "Cancelled",
  lapsed: "Expired",
  closed: "Closed",
  all: "All",
};

/** Why a registration is closed, in a few words. */
export const CLOSED_REASON: Record<string, string> = {
  registered_directly: "Registered another way",
  event_ended: "Event ended",
  event_deleted: "Event deleted",
  event_cancelled: "Event cancelled",
};

const optionalText = z
  .string()
  .nullish()
  .catch(null)
  .transform((v) => (v === null || v === undefined || v === "" ? null : v));

export const reviewRowSchema = z.object({
  id: z.coerce.string(),
  // An unknown status reads as closed: shown, never mistaken for one under review.
  status: z
    .string()
    .transform((s): ReviewStatus => ((REVIEW_STATUSES as readonly string[]).includes(s) ? (s as ReviewStatus) : "closed")),
  full_name: z
    .string()
    .nullish()
    .transform((v) => v?.trim() || "Unnamed"),
  email: optionalText,
  phone: optionalText,
  ticket_type: z
    .object({ id: z.coerce.number(), name: z.string() })
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
  /** When they registered. */
  submitted_at: z.string(),
  /** Set once a confirmed registration has its ticket. */
  registration_id: optionalText,
  /** Confirmed, paid, not paid yet: the pay-by time. */
  pay_by: optionalText,
  closed_reason: optionalText,
});
export type ReviewRow = z.infer<typeof reviewRowSchema>;

export type ReviewCounts = Record<ReviewStatus, number>;

export const reviewPageSchema = z
  .object({
    items: z.array(reviewRowSchema),
    next: z
      .string()
      .nullish()
      .transform((v) => v || null),
    counts: z.record(z.string(), z.number()).catch({}),
  })
  .transform(({ counts, ...page }) => {
    const byStatus = Object.fromEntries(
      REVIEW_STATUSES.map((s) => [s, Math.max(0, Math.trunc(counts[s] ?? 0))])
    ) as ReviewCounts;
    const sum = REVIEW_STATUSES.reduce((n, s) => n + byStatus[s], 0);
    return {
      ...page,
      counts: byStatus,
      /** Everyone who registered for review, whatever their status. */
      total:
        typeof counts.total === "number" && Number.isFinite(counts.total)
          ? Math.max(0, Math.trunc(counts.total))
          : sum,
    };
  });
export type ReviewPage = z.infer<typeof reviewPageSchema>;
