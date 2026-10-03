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
    payment_status: z.record(z.unknown()).nullish(),
    attendance_status: z.record(z.unknown()).nullish(),
    top_institutions: z.array(z.unknown()).default([]),
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
