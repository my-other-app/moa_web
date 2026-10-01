import { z } from "zod";

import { imageFieldSchema } from "@moa/app-kit";

export const orgSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  type: z.string().nullish(),
  address: z.string().nullish(),
  phone: z.string().nullish(),
  email: z.string().nullish(),
  website: z.string().nullish(),
  logo: imageFieldSchema,
  is_blocked: z.boolean().default(false),
});

/**
 * /orgs/list is unpaginated today but may gain an envelope later, so accept
 * both shapes and normalise to an array. One tolerant parse here is cheaper
 * than a breaking change rippling through the page.
 */
export const orgListSchema = z
  .union([z.array(orgSchema), z.object({ items: z.array(orgSchema) })])
  .transform((value) => (Array.isArray(value) ? value : value.items));

export type Org = z.infer<typeof orgSchema>;
