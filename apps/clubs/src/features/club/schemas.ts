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

/** One interest as the club endpoints return it (ClubInterestDetailMin). */
export const clubInterestSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  icon: z.string().nullish(),
  icon_type: z.string().nullish(),
});

export type ClubInterest = z.infer<typeof clubInterestSchema>;

/** GET /interests/list — interests already grouped by category. */
export const interestCategorySchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  icon: z.string().nullish(),
  icon_type: z.string().nullish(),
  interests: z.array(clubInterestSchema).default([]),
});

export type InterestCategory = z.infer<typeof interestCategorySchema>;

/** GET /orgs/list — only the fields the picker needs. */
export const organizationSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  type: z.string().nullish(),
  address: z.string().nullish(),
});

export type Organization = z.infer<typeof organizationSchema>;

export const clubOrgSchema = z
  .object({
    id: z.coerce.number(),
    name: z.string(),
    type: z.string().nullish(),
    address: z.string().nullish(),
    phone: z.string().nullish(),
    email: z.string().nullish(),
  })
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
  /** Brand colours designs and emails fall back to when a template sets none. */
  brand_primary: z.string().nullish(),
  brand_secondary: z.string().nullish(),
  socials: clubSocialsSchema,
  interests: z.array(clubInterestSchema).catch([]).default([]),
  org: clubOrgSchema,
});

export type ClubSelf = z.infer<typeof clubSelfSchema>;

const optionalUrl = z.string().trim().url("Enter a full URL").or(z.literal(""));

/**
 * Edit form. Mirrors what PUT /clubs/update accepts.
 *
 * Every field the endpoint reads is present, including `org_id`,
 * `interest_ids` and `location_link`, because `update_club` assigns each one
 * unconditionally and deletes all ClubInterestsLink rows before re-adding the
 * ids it was given. A partial payload therefore does not leave the omitted
 * fields alone -- it clears them. The design's edit screen (node 368:282)
 * covers all of them except the two contact fields and the location link; the
 * contacts are kept as visible fields and the link is round-tripped hidden,
 * so saving the profile cannot silently drop data a club entered elsewhere.
 */
export const clubProfileFormSchema = z.object({
  // 3..20 matches the Form(...) constraint on the endpoint; a longer name is
  // rejected server-side with a 422 that says nothing useful.
  name: z
    .string()
    .trim()
    .min(3, "Club name needs at least 3 characters")
    .max(20, "Club name can be at most 20 characters"),
  about: z.string().trim().max(2000, "Keep this under 2000 characters").optional(),
  org_id: z.number().int().nullable().default(null),
  location_name: z.string().trim().max(200).optional(),
  location_link: z.string().trim().max(500).optional(),
  contact_email: z.string().trim().email("Enter a valid email").or(z.literal("")).optional(),
  contact_phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{6,20}$/, "Enter a valid phone number")
    .or(z.literal(""))
    .optional(),
  brand_primary: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour, like #1db9a0").or(z.literal("")).optional(),
  brand_secondary: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour, like #aaaaaa").or(z.literal("")).optional(),
  instagram: optionalUrl.optional(),
  youtube: optionalUrl.optional(),
  linkedin: optionalUrl.optional(),
  website: optionalUrl.optional(),
  interest_ids: z.array(z.number().int()).default([]),
});

export type ClubProfileForm = z.infer<typeof clubProfileFormSchema>;

/** POST /auth/change-password. */
export const changePasswordSchema = z
  .object({
    old_password: z.string().min(1, "Enter your current password"),
    new_password: z.string().min(6, "Use at least 6 characters"),
    confirm_password: z.string().min(1, "Repeat the new password"),
  })
  .refine((v) => v.new_password === v.confirm_password, {
    path: ["confirm_password"],
    message: "Passwords do not match",
  })
  .refine((v) => v.new_password !== v.old_password, {
    path: ["new_password"],
    message: "Choose a password you have not used here before",
  });

export type ChangePasswordForm = z.infer<typeof changePasswordSchema>;

/**
 * Interest icons are stored as free text with an `icon_type`, and the seeded
 * rows contain the literal word "string". Rendering that verbatim puts
 * "string Coding" on the chip, so only a value that is actually outside ASCII
 * -- i.e. a real emoji -- is shown.
 */
export function interestEmoji(interest: {
  icon?: string | null;
  icon_type?: string | null;
}): string | null {
  if (!interest.icon || interest.icon_type !== "emoji") return null;
  return /[^\u0000-\u007F]/.test(interest.icon) ? interest.icon : null;
}
