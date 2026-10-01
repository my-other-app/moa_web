import { paginatedSchema } from "@moa/api";
import { z } from "zod";

import { imageFieldSchema } from "@moa/app-kit";

export const adminClubSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  slug: z.string().nullish(),
  logo: imageFieldSchema,
  location_name: z.string().nullish(),
  location_link: z.string().nullish(),
  about: z.string().nullish(),
  contact_phone: z.string().nullish(),
  contact_email: z.string().nullish(),
  created_at: z.string().nullish(),
  is_verified: z.boolean().default(false),
  interests: z.array(z.unknown()).default([]),
});

export const adminClubPageSchema = paginatedSchema(adminClubSchema);

export type AdminClub = z.infer<typeof adminClubSchema>;
export type AdminClubPage = z.infer<typeof adminClubPageSchema>;
