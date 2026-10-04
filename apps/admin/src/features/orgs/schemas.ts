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

/** The backend's OrgTypes enum, in full. */
export const ORG_TYPES = [
  "school",
  "university",
  "college",
  "company",
  "ngo",
  "community",
  "other",
] as const;

export const orgTypeSchema = z.enum(ORG_TYPES);

/** GET /orgs/admin/{id}/analytics. */
export const orgAnalyticsSchema = z.object({
  total_clubs: z.number().default(0),
  total_events: z.number().default(0),
  total_followers: z.number().default(0),
});

/**
 * Create and edit. PUT /orgs/update/{id} applies only the fields it receives
 * (`if value is not None`), so unlike clubs and events this is a genuine
 * partial update and omitting a field leaves it alone.
 */
export const orgFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Name needs at least 3 characters")
    .max(100, "Name can be at most 100 characters"),
  type: orgTypeSchema,
  address: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().email("Enter a valid email").or(z.literal("")).optional(),
  website: z.string().trim().max(100).optional(),
});

export type OrgType = z.infer<typeof orgTypeSchema>;
export type OrgAnalytics = z.infer<typeof orgAnalyticsSchema>;
export type OrgFormInput = z.infer<typeof orgFormSchema>;
