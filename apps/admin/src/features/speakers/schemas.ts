import { z } from "zod";

/**
 * The speakers directory (speakers-contract.md): one profile per person who
 * spoke at a MyOtherApp event, with every talk, each club's private contact,
 * the history of changes, and a merge queue for possible duplicates.
 */
const id = z.coerce.number();
const text = z.string().nullish().transform((v) => v ?? "");

export const STATUSES = ["active", "hidden", "merged"] as const;
export type SpeakerStatus = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<string, string> = { active: "Active", hidden: "Hidden", merged: "Merged" };
export const STATUS_TONE: Record<string, "success" | "warning" | "default"> = { active: "success", hidden: "warning", merged: "default" };

export const SORTS = [
  { value: "last_talk", label: "Last talk" },
  { value: "talks", label: "Most talks" },
  { value: "name", label: "Name" },
  { value: "created", label: "Newest" },
] as const;

export const photoSchema = z.object({ thumbnail: z.string().nullish(), medium: z.string().nullish() }).nullish();
export const topicRefSchema = z.object({ id, name: z.string(), slug: z.string().nullish() });
export const clubRefSchema = z.object({ id, name: text, slug: z.string().nullish() });
export const linksSchema = z.record(z.string().nullish()).catch({});

export const LINK_LABEL: Record<string, string> = { website: "Website", linkedin: "LinkedIn", x: "X", github: "GitHub", other: "Link" };

export const speakerRowSchema = z.object({
  id,
  slug: z.string().nullish(),
  name: z.string(),
  headline: z.string().nullish(),
  photo: photoSchema,
  city: z.string().nullish(),
  topics: z.array(topicRefSchema).catch([]),
  talks_count: z.coerce.number().catch(0),
  clubs: z.array(clubRefSchema).catch([]),
  last_talk_at: z.string().nullish(),
  status: z.string().catch("active"),
  claimed: z.boolean().catch(false),
  links: linksSchema,
});
export type SpeakerRow = z.infer<typeof speakerRowSchema>;

export const speakerPageSchema = z.object({ items: z.array(speakerRowSchema), total: z.coerce.number().catch(0) });
export type SpeakerPage = z.infer<typeof speakerPageSchema>;

export const sessionSchema = z.object({ id: z.union([z.string(), z.number()]).transform(String), title: text, starts_at: z.string().nullish(), ends_at: z.string().nullish() });

export const talkSchema = z.object({
  event_id: id,
  event_name: text,
  slug: z.string().nullish(),
  date: z.string().nullish(),
  talk_title: z.string().nullish(),
  status: z.string().nullish(),
  club: clubRefSchema.nullish(),
  sessions: z.array(sessionSchema).catch([]),
});
export type Talk = z.infer<typeof talkSchema>;

/** A club's contact as an admin sees it: email and phone, never the club's notes. */
export const clubContactSchema = z.object({
  club: clubRefSchema,
  email: z.string().nullish(),
  phone: z.string().nullish(),
  consent_at: z.string().nullish(),
  consent_by: z.string().nullish(),
  updated_at: z.string().nullish(),
});
export type ClubContact = z.infer<typeof clubContactSchema>;

export const historySchema = z.object({
  id,
  action: z.string(),
  actor_kind: z.string().nullish(),
  actor_name: z.string().nullish(),
  club_id: id.nullish(),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
  created_at: z.string().nullish(),
});
export type HistoryLine = z.infer<typeof historySchema>;

const profileRefSchema = z.object({ id, slug: z.string().nullish(), name: text });

export const speakerDetailSchema = z.object({
  id,
  slug: z.string().nullish(),
  name: z.string(),
  headline: z.string().nullish(),
  photo: photoSchema,
  bio: z.string().nullish(),
  links: linksSchema,
  city: z.string().nullish(),
  topics: z.array(topicRefSchema).catch([]),
  status: z.string().catch("active"),
  claimed: z.boolean().catch(false),
  talks: z.array(talkSchema).catch([]),
  talks_count: z.coerce.number().catch(0),
  contacts: z.array(clubContactSchema).catch([]),
  history: z.array(historySchema).catch([]),
  merged_from: z.array(profileRefSchema).catch([]),
  merged_into: profileRefSchema.nullish(),
  created_by_club: clubRefSchema.nullish(),
  claimed_by: z.object({ user_id: id, name: z.string().nullish(), email: z.string().nullish() }).nullish(),
  claimed_at: z.string().nullish(),
  removed_at: z.string().nullish(),
  followers_count: z.coerce.number().catch(0),
  invites: z
    .array(z.object({ email_masked: z.string().nullish(), created_at: z.string().nullish(), expires_at: z.string().nullish(), used_at: z.string().nullish(), revoked_at: z.string().nullish() }))
    .catch([]),
  page_url: z.string().nullish(),
});
export type SpeakerDetail = z.infer<typeof speakerDetailSchema>;

export const duplicateSideSchema = z.object({
  id,
  slug: z.string().nullish(),
  name: z.string(),
  headline: z.string().nullish(),
  photo: photoSchema,
  bio: z.string().nullish(),
  links: linksSchema,
  city: z.string().nullish(),
  topics: z.array(topicRefSchema).catch([]),
  status: z.string().catch("active"),
  claimed: z.boolean().catch(false),
  talks_count: z.coerce.number().catch(0),
  clubs: z.array(clubRefSchema).catch([]),
  talks: z.array(z.object({ event_id: id, event_name: text, date: z.string().nullish(), club: clubRefSchema.nullish() })).catch([]),
});
export type DuplicateSide = z.infer<typeof duplicateSideSchema>;

export const duplicateSchema = z.object({ id, a: duplicateSideSchema, b: duplicateSideSchema, reason: z.string().nullish(), score: z.coerce.number().nullish(), status: z.string().catch("open") });
export type Duplicate = z.infer<typeof duplicateSchema>;
export const duplicatesSchema = z.array(duplicateSchema);

export const REASON_LABEL: Record<string, string> = {
  same_name_other_club: "Same name, another club",
  same_link_other_name: "Same link, another name",
};
export const reasonLabel = (r: string | null | undefined) => (r ? (REASON_LABEL[r] ?? r.replace(/_/g, " ")) : "Possible duplicate");

export const HISTORY_LABEL: Record<string, string> = {
  created: "Profile made",
  edited: "Edited",
  hidden: "Hidden",
  unhidden: "Shown again",
  removed_on_request: "Removed on request",
  merged_into: "Merged into another",
  merged_from: "Another profile merged in",
  unmerged: "Merge taken back",
  unmerged_from: "A merged profile taken back out",
  invited: "Invited to claim",
  claimed: "Claimed",
  contact_updated: "A club changed its contact",
  contact_removed: "A club removed its contact",
  added_to_event: "Added to an event",
  applied_to_upcoming: "Copied to upcoming events",
  duplicate_dismissed: "Not a duplicate",
  photo_changed: "Photo changed",
};
export const historyLabel = (a: string) => HISTORY_LABEL[a] ?? a.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/**
 * The organisation in a headline ("Head of Research · IIT-M", "Engineer at
 * Acme", "PM @ Zoho", "Founder, Brew & Co"): what "Make a lead" proposes as
 * the lead's name. Empty when the headline names none.
 */
export function orgFromHeadline(headline: string | null | undefined): string {
  const h = (headline ?? "").trim();
  if (!h) return "";
  for (const sep of [" · ", "·", " | ", " @ ", "@", " at ", ", "]) {
    const at = h.lastIndexOf(sep);
    if (at >= 0) {
      const org = h.slice(at + sep.length).trim();
      if (org) return org;
    }
  }
  return "";
}

/** The new-lead form (Team work → Leads), opened filled in: the organisation, a sponsor by default, source "speaker". */
export function makeLeadHref(headline: string | null | undefined): string {
  const params = new URLSearchParams({ new: "1", type: "sponsor", source: "speaker" });
  const org = orgFromHeadline(headline);
  if (org) params.set("name", org);
  return `/teamwork/leads?${params.toString()}`;
}

/** Only web links: a profile's link that is not http(s) is not offered. */
export function safeLink(url: string | null | undefined): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}
