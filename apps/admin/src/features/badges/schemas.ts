import { z } from "zod";

export const badgeSchema = z.object({
  id: z.coerce.number(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  emoji: z.string().nullish(),
  badge_type: z.string().nullish(),
  trigger_metric: z.string().nullish(),
  threshold: z.number().nullish(),
  claimed_count: z.number().nullish(),
});

export const badgeListSchema = z
  .union([z.array(badgeSchema), z.object({ items: z.array(badgeSchema) })])
  .transform((value) => (Array.isArray(value) ? value : value.items));

export type Badge = z.infer<typeof badgeSchema>;
