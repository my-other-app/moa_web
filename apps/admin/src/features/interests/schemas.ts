import { z } from "zod";

const interestSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  icon: z.string().nullish(),
  icon_type: z.string().nullish(),
});

/** GET /interests/list — already grouped by category server-side. */
export const interestCategorySchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  icon: z.string().nullish(),
  icon_type: z.string().nullish(),
  interests: z.array(interestSchema).default([]),
});

export const interestFormSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(50),
  category_id: z.number().int(),
  icon: z.string().trim().max(10).optional(),
});

export type Interest = z.infer<typeof interestSchema>;
export type InterestCategory = z.infer<typeof interestCategorySchema>;
export type InterestFormInput = z.infer<typeof interestFormSchema>;
