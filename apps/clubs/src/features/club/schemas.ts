import { imageFieldSchema, interestEmoji, topicRefsField } from "@moa/app-kit";
import { z } from "zod";

import { pinDetailShape, pinFormShape, refinePin } from "@/features/venue";

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

/**
 * One interest as the club endpoints return it (ClubInterestDetailMin).
 * `category_id` -- the topic it sits under -- arrives with the topics
 * release; absent before it.
 */
export const clubInterestSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  icon: z.string().nullish(),
  icon_type: z.string().nullish(),
  category_id: z.coerce.number().nullish(),
});

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
export const clubPartnerSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  role: z.string().nullish(),
  since: z.number().nullish(),
  sort_order: z.number().default(0),
  logo: imageFieldSchema,
});
export type ClubPartner = z.infer<typeof clubPartnerSchema>;

export const clubTeamMemberSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  role: z.string().nullish(),
  instagram: z.string().nullish(),
  linkedin: z.string().nullish(),
  x: z.string().nullish(),
  website: z.string().nullish(),
  sort_order: z.number().default(0),
  photo: imageFieldSchema,
});
export type ClubTeamMember = z.infer<typeof clubTeamMemberSchema>;

export const clubSelfSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  slug: z.string().nullish(),
  logo: imageFieldSchema,
  location_name: z.string().nullish(),
  location_link: z.string().nullish(),
  /** lat, lng and geo_source: the club's pin, and where it came from. */
  ...pinDetailShape,
  about: z.string().nullish(),
  /** One line under the name; the about is the long form. */
  tagline: z.string().nullish(),
  cover: imageFieldSchema,
  partners: z.array(clubPartnerSchema).catch([]).default([]),
  team: z.array(clubTeamMemberSchema).catch([]).default([]),
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
  /** The distinct topics of its interests, in topic order; null from a server before topics. */
  topics: topicRefsField,
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
 * contacts are kept as visible fields and the link lives under the location's
 * "Adjust pin", so saving the profile cannot silently drop data a club
 * entered elsewhere.
 *
 * The pin (lat, lng, clear_point) is the exception to "send everything": the
 * server keeps deriving a pin from the link or the location's name, so only
 * one the club set, or the removal of it, is sent.
 */
export const clubProfileFormSchema = z.object({
  // Shown, not edited: the name changes only through support, and PUT
  // /clubs/update ignores it. It was still checked for 3..20 characters, so a
  // club with a longer name (one an admin or the demo seed made, up to the
  // column's 100) could not save its profile at all -- Save did nothing.
  name: z.string().optional(),
  about: z.string().trim().max(2000, "Keep this under 2000 characters").optional(),
  tagline: z.string().trim().max(120, "Keep the tagline under 120 characters").optional(),
  org_id: z.number().int().nullable().default(null),
  location_name: z.string().trim().max(200).optional(),
  location_link: z.string().trim().max(500).optional(),
  /** The pin. Not columns the handler overwrites: sent only when the club set or removed it. */
  ...pinFormShape,
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
}).superRefine(refinePin);

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

/** Shared with the topic picker; kept exported here for the callers that read it from the club. */
export { interestEmoji };

/** One partner row: a name, what they are to the club, and since when. */
export const partnerFormSchema = z.object({
  name: z.string().trim().min(1, "Name the partner").max(100, "Keep the name under 100 characters"),
  role: z.string().trim().max(80, "Keep the role under 80 characters"),
  since: z
    .union([z.literal(""), z.coerce.number().int().min(1900, "Enter a year like 2024").max(2100, "Enter a year like 2024")])
    .transform((v) => (v === "" ? null : v)),
});
export type PartnerForm = z.infer<typeof partnerFormSchema>;

const handle = z.string().trim().max(255, "Keep it under 255 characters");
export const teamMemberFormSchema = z.object({
  name: z.string().trim().min(1, "Name the person").max(100, "Keep the name under 100 characters"),
  role: z.string().trim().max(80, "Keep the role under 80 characters"),
  instagram: handle,
  linkedin: handle,
  x: handle,
  website: handle,
});
export type TeamMemberForm = z.infer<typeof teamMemberFormSchema>;

/** A handle or a link, as typed, made into the link the page opens. */
export function socialHref(kind: "instagram" | "linkedin" | "x" | "website", raw: string): string {
  const v = raw.trim().replace(/^@/, "");
  if (/^https?:\/\//i.test(v)) return v;
  if (kind === "instagram") return `https://instagram.com/${v}`;
  if (kind === "x") return `https://x.com/${v}`;
  if (kind === "linkedin") return v.includes("/") ? `https://${v.replace(/^\/+/, "")}` : `https://linkedin.com/in/${v}`;
  return `https://${v}`;
}

/** Swatches offered before the custom picker; the first is the product's own teal. */
export const BRAND_PRESETS = ["#17a58f", "#2f6fed", "#7c4dff", "#ef6c35", "#e24a8d", "#f2b136"] as const;
