import { z } from "zod";

export const totpStatusSchema = z.object({
  enabled: z.boolean().default(false),
  recovery_codes_remaining: z.number().default(0),
});

export const totpSetupSchema = z.object({
  secret: z.string(),
  provisioning_uri: z.string(),
});

export const totpEnableSchema = z.object({
  enabled: z.boolean(),
  /** Returned once and never again — only hashes are stored. */
  recovery_codes: z.array(z.string()).default([]),
});

export const sessionSchema = z.object({
  id: z.string(),
  user_agent: z.string().nullish(),
  ip_address: z.string().nullish(),
  last_seen_at: z.string().nullish(),
  created_at: z.string().nullish(),
  current: z.boolean().default(false),
});

export type TotpStatus = z.infer<typeof totpStatusSchema>;
export type SessionInfo = z.infer<typeof sessionSchema>;
