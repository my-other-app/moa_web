import { paginatedSchema } from "@moa/api";
import { imageFieldSchema, namedRefSchema } from "@moa/app-kit";
import { z } from "zod";

/** GET /clubs/events/list — the signed-in club's own events. */
export const clubEventSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  slug: z.string().nullish(),
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
  category: namedRefSchema,
  page_views: z.number().nullish(),
  registration_count: z.number().nullish(),
  attended_count: z.number().nullish(),
});

export const clubEventPageSchema = paginatedSchema(clubEventSchema);

export type ClubEvent = z.infer<typeof clubEventSchema>;
