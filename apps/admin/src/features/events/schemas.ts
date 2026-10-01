import { paginatedSchema } from "@moa/api";
import { z } from "zod";

import { imageFieldSchema, namedRefSchema } from "@/lib/schemas";

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
});

export const adminEventPageSchema = paginatedSchema(adminEventSchema);

export type AdminEvent = z.infer<typeof adminEventSchema>;
