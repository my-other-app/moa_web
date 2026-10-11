import { paginatedSchema } from "@moa/api";
import { z } from "zod";

import { deliveryBriefSchema } from "@/features/deliveries";

/**
 * What someone is attending as, which picks the ticket and certificate
 * variant they are issued. Mirrors the backend's RegistrationRole.
 */
export const REGISTRATION_ROLES = ["attendee", "speaker", "staff"] as const;
export type RegistrationRole = (typeof REGISTRATION_ROLES)[number];

export const registrationSchema = z.object({
  // A UUID, not an integer — the attendance endpoint takes it as a path param.
  id: z.string(),
  ticket_id: z.string().nullish(),
  event_id: z.coerce.number().nullish(),
  full_name: z.string().nullish(),
  name: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  institution: z.string().nullish(),
  actual_amount: z.number().nullish(),
  paid_amount: z.number().nullish(),
  is_paid: z.boolean().default(false),
  is_attended: z.boolean().default(false),
  is_won: z.boolean().default(false),
  /*
   * Defaulted rather than required: every row has one server-side, but a
   * cached response from before the field existed must still parse.
   */
  role: z.enum(REGISTRATION_ROLES).default("attendee"),
  created_at: z.string().nullish(),
  // The ticket's own state: whether it was taken back, and what was sent for it.
  ticket_revoked_at: z.string().nullish(),
  ticket_deliveries: z.array(deliveryBriefSchema).default([]),
  user: z
    .object({
      id: z.coerce.number().nullish(),
      full_name: z.string().nullish(),
      username: z.string().nullish(),
      email: z.string().nullish(),
    })
    .passthrough()
    .nullish(),
});

export const registrationPageSchema = paginatedSchema(registrationSchema);

/** One guest in full: the record, and everything that was sent to them. */
export const registrationDetailSchema = registrationSchema.extend({
  attended_on: z.string().nullish(),
  additional_details: z.record(z.unknown()).nullish(),
  certificate_issued_at: z.string().nullish(),
  certificate_revoked_at: z.string().nullish(),
  certificate_deliveries: z.array(deliveryBriefSchema).default([]),
  updated_at: z.string().nullish(),
});
export type RegistrationDetail = z.infer<typeof registrationDetailSchema>;

export const importLogSchema = z.object({
  id: z.string(),
  task_name: z.string(),
  status: z.string(),
  created_at: z.string(),
  imported: z.number().default(0),
  failed: z.number().default(0),
  issues: z.array(z.string()).default([]),
});
export type ImportLog = z.infer<typeof importLogSchema>;

/** A question on the event's registration form, as the event carries it. */
export const eventFieldSchema = z
  .object({
    key: z.string(),
    label: z.string().nullish(),
    field_type: z.string().nullish(),
    options: z.array(z.string()).nullish(),
    required: z.boolean().nullish(),
  })
  .passthrough();
export type EventField = z.infer<typeof eventFieldSchema>;

export const eventAnalyticsSchema = z
  .object({
    total_registrations: z.number().default(0),
    total_revenue: z.number().default(0),
    attendance_rate: z.number().default(0),
    conversion_rate: z.number().default(0),
    /*
     * Declared properly rather than left as `unknown`. All of this is
     * computed per event and was displayed nowhere -- a club running a paid
     * event could not see what it earned, whether anyone turned up, or which
     * colleges they came from beyond a bare count.
     */
    payment_status: z
      .object({ paid: z.number().default(0), unpaid: z.number().default(0) })
      .nullish(),
    attendance_status: z
      .object({ attended: z.number().default(0), absent: z.number().default(0) })
      .nullish(),
    top_institutions: z
      .array(z.object({ name: z.string(), value: z.number() }))
      .default([]),
    /*
     * These two were not in the schema at all and survived only because it is
     * `.passthrough()`. The backend has been computing when people register
     * through the day, and when they checked in, and nothing ever read it.
     */
    registration_time: z
      .object({
        morning: z.number().default(0),
        afternoon: z.number().default(0),
        evening: z.number().default(0),
        night: z.number().default(0),
      })
      .nullish(),
    attendance_over_time: z
      .array(z.object({ time: z.string(), count: z.number() }))
      .default([]),
    /*
     * Distinct institutions across every registration. `top_institutions` is
     * sliced to the five largest server-side, so its length is not this
     * number -- an event with fifty colleges would read 5.
     */
    total_institutions: z.number().default(0),
  })
  .passthrough();

export type Registration = z.infer<typeof registrationSchema>;
export type EventAnalytics = z.infer<typeof eventAnalyticsSchema>;
