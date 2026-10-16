import { z } from "zod";

export const sessionSchema = z.object({
  id: z.string(),
  device: z.string(),
  kind: z.enum(["phone", "tablet", "computer", "unknown"]).catch("unknown"),
  place: z.string().nullable(),
  ip_address: z.string().nullable(),
  created_at: z.string().nullable(),
  last_seen_at: z.string().nullable(),
  current: z.boolean(),
  /** A club team member's session on the club account: their name. */
  who: z.string().nullable().optional().catch(null),
});

export const historyRowSchema = z.object({
  id: z.string(),
  at: z.string(),
  place: z.string().nullable(),
  device: z.string(),
  ip_address: z.string().nullable(),
  method: z.string(),
  result: z.string(),
});

export const securityOverviewSchema = z.object({
  account: z.string(),
  counts: z.object({
    active_sessions: z.number(),
    sessions_30d: z.number(),
    sessions_delta: z.number().nullable(),
    places_30d: z.number(),
    places_delta: z.number().nullable(),
    failed_30d: z.number(),
    failed_delta: z.number().nullable(),
    last_blocked_place: z.string().nullable(),
  }),
  sessions: z.array(sessionSchema),
  by_place: z.array(z.object({ place: z.string(), total: z.number(), failed: z.number() })),
  history: z.array(historyRowSchema),
  two_factor: z.object({ enabled: z.boolean(), recovery_codes_remaining: z.number() }),
  notify_new_device: z.boolean(),
  lockout: z.object({ max_failed: z.number(), window_minutes: z.number() }),
  generated_at: z.string(),
});

export type SecurityOverview = z.infer<typeof securityOverviewSchema>;
export type ActiveSession = z.infer<typeof sessionSchema>;
export type HistoryRow = z.infer<typeof historyRowSchema>;

export const twoFactorSetupSchema = z.object({ secret: z.string(), provisioning_uri: z.string() });
export const twoFactorEnabledSchema = z.object({ enabled: z.boolean(), recovery_codes: z.array(z.string()).default([]) });

/** How a row in the history reads, and how it is coloured. */
export const RESULTS: Record<string, { label: string; tone: "admit" | "caution" | "refuse" | "neutral"; failed: boolean }> = {
  signed_in: { label: "Signed in", tone: "admit", failed: false },
  wrong_password: { label: "Wrong password", tone: "caution", failed: true },
  totp_required: { label: "Code asked for", tone: "neutral", failed: false },
  totp_invalid: { label: "Wrong code", tone: "caution", failed: true },
  blocked: { label: "Blocked", tone: "refuse", failed: true },
};
export const resultOf = (r: string) => RESULTS[r] ?? { label: r.replace(/_/g, " "), tone: "neutral" as const, failed: false };

export const METHODS: Record<string, string> = { password: "Password", google: "Google", apple: "Apple" };
