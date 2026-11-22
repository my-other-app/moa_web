import { z } from "zod";

/** What the station is told to print (`ClaimOut`, print-stations contract §2.2). */
export const claimedSchema = z.object({
  id: z.string(),
  registration_id: z.string().nullish(),
  name: z.string().default(""),
  ticket_code: z.string().nullish(),
  source: z.string().default("dashboard"),
  attempt: z.number().default(1),
  card_url: z.string(),
});
export type Claimed = z.infer<typeof claimedSchema>;

export const claimResponseSchema = z.object({ request: claimedSchema.nullish().transform((v) => v ?? null), queued: z.number().default(0) });
export type ClaimResponse = z.infer<typeof claimResponseSchema>;
