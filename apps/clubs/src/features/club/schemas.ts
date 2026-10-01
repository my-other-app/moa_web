import { imageFieldSchema } from "@moa/app-kit";
import { z } from "zod";

export const clubSocialsSchema = z
  .object({
    instagram: z.string().nullish(),
    youtube: z.string().nullish(),
    linkedin: z.string().nullish(),
    website: z.string().nullish(),
  })
  .partial()
  .passthrough()
  .nullish();

/** GET /clubs/info — the signed-in user's own club. */
export const clubSelfSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  slug: z.string().nullish(),
  logo: imageFieldSchema,
  location_name: z.string().nullish(),
  location_link: z.string().nullish(),
  about: z.string().nullish(),
  rating: z.number().nullish(),
  total_ratings: z.number().nullish(),
  total_events: z.number().nullish(),
  live_events: z.number().nullish(),
  past_events: z.number().nullish(),
  followers_count: z.number().nullish(),
  contact_phone: z.string().nullish(),
  contact_email: z.string().nullish(),
  socials: clubSocialsSchema,
  interests: z.array(z.unknown()).default([]),
  org: z.unknown().nullish(),
});

export type ClubSelf = z.infer<typeof clubSelfSchema>;

/**
 * Edit form. Mirrors what PUT /clubs/update accepts; the logo is uploaded
 * separately through PUT /clubs/logo because it is multipart.
 */
export const clubProfileFormSchema = z.object({
  name: z.string().trim().min(2, "Club name is required"),
  about: z.string().trim().max(2000, "Keep this under 2000 characters").optional(),
  location_name: z.string().trim().max(200).optional(),
  contact_email: z
    .string()
    .trim()
    .email("Enter a valid email")
    .or(z.literal(""))
    .optional(),
  contact_phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{6,20}$/, "Enter a valid phone number")
    .or(z.literal(""))
    .optional(),
  instagram: z.string().trim().url("Enter a full URL").or(z.literal("")).optional(),
  youtube: z.string().trim().url("Enter a full URL").or(z.literal("")).optional(),
  linkedin: z.string().trim().url("Enter a full URL").or(z.literal("")).optional(),
  website: z.string().trim().url("Enter a full URL").or(z.literal("")).optional(),
});

export type ClubProfileForm = z.infer<typeof clubProfileFormSchema>;
