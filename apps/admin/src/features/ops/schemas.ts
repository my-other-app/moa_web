import { z } from "zod";

/**
 * The operator tools this backend has: GET /api/v1/admin/ops/me.
 *
 * The portal deploys from main ahead of the backend, so every screen built on
 * these tools asks first and stays hidden on a server that answers the probe
 * with a route-level 404 (nullIfRouteMissing → null).
 */
export const OPS_FEATURES = [
  "payouts",
  "disputes",
  "refunds",
  "admins",
  "settings",
  "jobs",
  "push",
  "suppressions",
  "whatsapp_templates",
  "club_reject",
  "two_factor_policy",
] as const;
export type OpsFeature = (typeof OPS_FEATURES)[number];

export const twoFactorStandingSchema = z.object({
  required: z.boolean().catch(false),
  enabled: z.boolean().catch(false),
  grace_ends_at: z.string().nullish(),
  grace_days: z.number().nullish(),
  blocked: z.boolean().catch(false),
});
export type TwoFactorStanding = z.infer<typeof twoFactorStandingSchema>;

export const opsMeSchema = z.object({
  /* Kept as the server says: a feature this build does not know is ignored, not an error. */
  features: z.array(z.string()).catch([]),
  role: z.string().nullish(),
  two_factor: twoFactorStandingSchema.nullish(),
  maintenance_banner: z.string().nullish(),
});
export type OpsMe = z.infer<typeof opsMeSchema>;

/** Whether the probe lists a feature; false for an old backend (null) or one still loading. */
export function hasFeature(me: OpsMe | null | undefined, feature: OpsFeature): boolean {
  return Boolean(me?.features.includes(feature));
}

/** The grace banner's line: shown while an admin without two-factor still has days left. */
export function graceNotice(standing: TwoFactorStanding | null | undefined): string | null {
  if (!standing || standing.enabled || standing.blocked || !standing.grace_ends_at) return null;
  const end = new Date(standing.grace_ends_at);
  if (Number.isNaN(end.getTime())) return null;
  const when = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(end);
  return `Turn on two-factor sign-in by ${when}. After that the portal stays closed to your account until you do.`;
}
