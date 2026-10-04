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

/**
 * The metrics the award checker actually computes, from _get_user_metrics and
 * _get_club_metrics. A badge whose trigger is not in this list is never
 * awarded automatically -- the checker simply finds no value for it -- so the
 * form offers only these rather than a free-text field.
 */
export const USER_METRICS = [
  "events_registered",
  "events_attended",
  "events_won",
  "runner_up_count",
  "podium_count",
  "events_rated",
  "events_paid",
] as const;

export const CLUB_METRICS = [
  "events_hosted",
  "follower_count",
  "avg_rating",
  "total_attendees",
  "is_verified",
] as const;

export const BADGE_TYPES = ["user", "club"] as const;

export const badgeStatsSchema = z.object({
  badge: badgeSchema,
  total_awarded: z.number().default(0),
  awards_last_30_days: z.number().default(0),
  awards_last_7_days: z.number().default(0),
  recent_awards: z
    .array(
      z.object({
        id: z.coerce.number(),
        entity_id: z.coerce.number(),
        entity_name: z.string().nullish(),
        entity_email: z.string().nullish(),
        awarded_at: z.string().nullish(),
      })
    )
    .default([]),
});

export const badgeRecipientSchema = z.object({
  id: z.coerce.number(),
  entity_id: z.coerce.number(),
  entity_name: z.string().nullish(),
  entity_email: z.string().nullish(),
  awarded_at: z.string().nullish(),
});

export const badgeRecipientsSchema = z.object({
  badge: badgeSchema,
  recipients: z.array(badgeRecipientSchema).default([]),
  total: z.number().default(0),
});

/**
 * Create and edit. `slug` and `badge_type` are only settable at creation:
 * BadgeDefinitionUpdate has no badge_type field, and changing a slug would
 * orphan anything referencing it.
 */
export const badgeFormSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2, "Slug is required")
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Lower-case letters, numbers and hyphens only"),
  name: z.string().trim().min(2, "Name is required").max(100),
  description: z.string().trim().min(2, "Describe what earns this badge").max(255),
  emoji: z.string().trim().min(1, "Pick an emoji").max(10),
  badge_type: z.enum(BADGE_TYPES),
  trigger_metric: z.string().trim().min(1, "Choose a metric"),
  threshold: z.coerce.number().min(0, "Must be zero or more"),
});

export type BadgeStats = z.infer<typeof badgeStatsSchema>;
export type BadgeRecipient = z.infer<typeof badgeRecipientSchema>;
export type BadgeFormInput = z.infer<typeof badgeFormSchema>;
