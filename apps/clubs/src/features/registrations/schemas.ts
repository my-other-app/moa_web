import { paginatedSchema } from "@moa/api";
import { z } from "zod";

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
  created_at: z.string().nullish(),
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
