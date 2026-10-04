import { paginatedSchema } from "@moa/api";
import { imageFieldSchema } from "@moa/app-kit";
import { z } from "zod";

/**
 * Runtime shape of an admin user row.
 *
 * Written by hand rather than taken from the generated types because the
 * backend publishes these fields as `anyOf: [string, {}]` (see
 * @moa/api's zod-helpers for why), which generates as `unknown`. Validating
 * here gives the table real types and fails loudly if the shape changes.
 */
export const adminUserSchema = z.object({
  id: z.coerce.number(),
  full_name: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  username: z.string(),
  user_type: z.string(),
  provider: z.string().nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
});

export const adminUserPageSchema = paginatedSchema(adminUserSchema);

export type AdminUser = z.infer<typeof adminUserSchema>;
export type AdminUserPage = z.infer<typeof adminUserPageSchema>;

/** Aggregates from GET /user/admin/{id}. Counted in SQL, so cheap. */
export const adminUserStatsSchema = z.object({
  clubs_following: z.number().default(0),
  events_registered: z.number().default(0),
  events_attended: z.number().default(0),
  events_won: z.number().default(0),
  badges_earned: z.number().default(0),
  total_paid: z.number().default(0),
});

export const adminUserDetailSchema = adminUserSchema.extend({
  stats: adminUserStatsSchema,
  /* Suspension, as distinct from deletion. A suspended account keeps its
     data and can be reinstated; the API refuses it on every request. */
  is_active: z.boolean().default(true),
  suspended_reason: z.string().nullish(),
  profile: z
    .object({
      id: z.coerce.number().nullish(),
      full_name: z.string().nullish(),
      whatsapp: z.string().nullish(),
      profile_pic: imageFieldSchema,
      avatar: z
        .object({ id: z.coerce.number(), name: z.string(), image: imageFieldSchema })
        .passthrough()
        .nullish(),
      org: z
        .object({ id: z.coerce.number(), name: z.string() })
        .passthrough()
        .nullish(),
    })
    .passthrough()
    .nullish(),
  interests: z
    .array(
      z
        .object({ id: z.coerce.number(), name: z.string() })
        .passthrough()
    )
    .nullish(),
});

/** A club the user follows, as GET /user/admin/{id}/clubs returns it. */
export const userClubSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  slug: z.string().nullish(),
  logo: imageFieldSchema,
  location_name: z.string().nullish(),
  followers_count: z.number().default(0),
  is_following: z.boolean().default(false),
});

/** One registration, as GET /user/admin/{id}/events returns it. */
export const userEventSchema = z.object({
  ticket_id: z.string(),
  full_name: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  is_paid: z.boolean().default(false),
  actual_amount: z.number().nullish(),
  paid_amount: z.number().nullish(),
  event: z.object({
    id: z.coerce.number(),
    name: z.string(),
    slug: z.string().nullish(),
    poster: imageFieldSchema,
    event_datetime: z.string().nullish(),
    location_name: z.string().nullish(),
    is_online: z.boolean().default(false),
    has_prize: z.boolean().default(false),
    club: z.object({ id: z.coerce.number(), name: z.string() }).passthrough().nullish(),
    category: z.object({ id: z.coerce.number(), name: z.string() }).passthrough().nullish(),
  }).passthrough(),
});

/** GET /badges/user/{id}. */
export const userBadgesSchema = z.object({
  user_id: z.coerce.number(),
  badges: z
    .array(
      z.object({
        id: z.coerce.number(),
        name: z.string().nullish(),
        description: z.string().nullish(),
        emoji: z.string().nullish(),
        slug: z.string().nullish(),
        awarded_at: z.string().nullish(),
      }).passthrough()
    )
    .default([]),
});

export const userClubPageSchema = paginatedSchema(userClubSchema);
export const userEventPageSchema = paginatedSchema(userEventSchema);

export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;
export type AdminUserStats = z.infer<typeof adminUserStatsSchema>;
export type UserClub = z.infer<typeof userClubSchema>;
export type UserEvent = z.infer<typeof userEventSchema>;
export type UserBadges = z.infer<typeof userBadgesSchema>;
