import { z } from "zod";

export const SUPPRESSION_REASONS = ["bounce", "complaint"] as const;

export const suppressionSchema = z.object({
  email: z.string(),
  reason: z.string(),
  detail: z.string().nullish(),
  created_at: z.string().nullish(),
});
export type Suppression = z.infer<typeof suppressionSchema>;

export const suppressionPageSchema = z.object({
  items: z.array(suppressionSchema),
  total: z.number().catch(0),
  offset: z.number().catch(0),
  limit: z.number().catch(50),
  counts: z.object({ bounce: z.number().catch(0), complaint: z.number().catch(0), last_30_days: z.number().catch(0) }).catch({ bounce: 0, complaint: 0, last_30_days: 0 }),
});
export type SuppressionPage = z.infer<typeof suppressionPageSchema>;

export function reasonWords(reason: string): string {
  if (reason === "bounce") return "Bounced";
  if (reason === "complaint") return "Marked as spam";
  return reason;
}
