import { paginatedSchema } from "@moa/api";
import { z } from "zod";

import { imageFieldSchema } from "@moa/app-kit";

export const adminClubSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  slug: z.string().nullish(),
  logo: imageFieldSchema,
  location_name: z.string().nullish(),
  location_link: z.string().nullish(),
  about: z.string().nullish(),
  contact_phone: z.string().nullish(),
  contact_email: z.string().nullish(),
  created_at: z.string().nullish(),
  is_verified: z.boolean().default(false),
  interests: z.array(z.unknown()).default([]),
  /* The four the v2 table shows per row. All defaulted: the same shape also
     comes back from approve and reject, which build one club without them. */
  followers_count: z.number().default(0),
  events_count: z.number().default(0),
  org: z.object({ id: z.coerce.number(), name: z.string() }).nullish(),
  /* The club's sign-in address, which is not contact_email -- that one is
     published on the club's page and is usually a committee alias. */
  owner_email: z.string().nullish(),
});

export const adminClubPageSchema = paginatedSchema(adminClubSchema);

export type AdminClub = z.infer<typeof adminClubSchema>;
export type AdminClubPage = z.infer<typeof adminClubPageSchema>;

const namedRef = z.object({ id: z.coerce.number(), name: z.string() }).passthrough();

/** GET /clubs/admin/{id} — the public detail plus admin-only fields. */
export const adminClubDetailSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  slug: z.string().nullish(),
  logo: imageFieldSchema,
  location_name: z.string().nullish(),
  location_link: z.string().nullish(),
  about: z.string().nullish(),
  contact_phone: z.string().nullish(),
  contact_email: z.string().nullish(),
  rating: z.number().nullish(),
  total_ratings: z.number().nullish(),
  total_events: z.number().default(0),
  live_events: z.number().default(0),
  past_events: z.number().default(0),
  followers_count: z.number().default(0),
  socials: z
    .object({
      instagram: z.string().nullish(),
      linkedin: z.string().nullish(),
      youtube: z.string().nullish(),
      website: z.string().nullish(),
    })
    .partial()
    .passthrough()
    .nullish(),
  interests: z.array(namedRef).catch([]).default([]),
  org: namedRef.nullish(),
  is_verified: z.boolean().default(false),
  is_deleted: z.boolean().default(false),
  created_at: z.string().nullish(),
  // The colours designs and emails fall back to; null when the club set none.
  brand_primary: z.string().nullish(),
  brand_secondary: z.string().nullish(),
  owner: z
    .object({
      id: z.coerce.number(),
      full_name: z.string().nullish(),
      username: z.string().nullish(),
      email: z.string().nullish(),
    })
    .nullish(),
  admin_stats: z
    .object({
      total_registrations: z.number().default(0),
      total_attended: z.number().default(0),
      total_revenue: z.number().default(0),
    })
    .default({ total_registrations: 0, total_attended: 0, total_revenue: 0 }),
});

/** A follower of the club, from GET /clubs/followers/{id}. */
export const clubFollowerSchema = z.object({
  user: z
    .object({
      id: z.coerce.number().nullish(),
      full_name: z.string().nullish(),
      username: z.string().nullish(),
      email: z.string().nullish(),
    })
    .passthrough()
    .nullish(),
  is_following: z.boolean().default(true),
  created_at: z.string().nullish(),
});

/** One of the club's events, from GET /clubs/{id}/events. */
export const clubEventSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  poster: imageFieldSchema,
  event_datetime: z.string().nullish(),
  location_name: z.string().nullish(),
  registration_count: z.number().nullish(),
  attended_count: z.number().nullish(),
});

export const clubFollowerPageSchema = paginatedSchema(clubFollowerSchema);
export const clubEventPageSchema = paginatedSchema(clubEventSchema);

/**
 * Admin edit form. Mirrors PUT /clubs/admin/{id}, which assigns every column
 * from the request and clears the interest links before re-adding what it was
 * sent -- so a partial payload clears what it omits.
 */
export const clubEditSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Club name needs at least 3 characters")
    .max(20, "Club name can be at most 20 characters"),
  about: z.string().trim().max(2000).optional(),
  location_name: z.string().trim().max(200).optional(),
  location_link: z.string().trim().max(500).optional(),
  contact_email: z.string().trim().email("Enter a valid email").or(z.literal("")).optional(),
  contact_phone: z.string().trim().max(20).optional(),
  instagram: z.string().trim().url("Enter a full URL").or(z.literal("")).optional(),
  youtube: z.string().trim().url("Enter a full URL").or(z.literal("")).optional(),
  linkedin: z.string().trim().url("Enter a full URL").or(z.literal("")).optional(),
  website: z.string().trim().url("Enter a full URL").or(z.literal("")).optional(),
  org_id: z.number().int().nullable().default(null),
  interest_ids: z.array(z.number().int()).default([]),
});

export type AdminClubDetail = z.infer<typeof adminClubDetailSchema>;
export type ClubFollower = z.infer<typeof clubFollowerSchema>;
export type ClubEvent = z.infer<typeof clubEventSchema>;
export type ClubEditInput = z.infer<typeof clubEditSchema>;
