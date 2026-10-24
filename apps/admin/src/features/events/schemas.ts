import { paginatedSchema } from "@moa/api";
import { z } from "zod";

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
});

export const adminEventPageSchema = paginatedSchema(adminEventSchema);

export type AdminEvent = z.infer<typeof adminEventSchema>;

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
