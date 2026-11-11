import { z } from "zod";

/**
 * The club's side of the speakers directory (speakers-contract.md): its
 * past speakers to pick from when adding one to an event, everyone who has
 * spoken at its events with the club's own contact and notes, and a
 * profile's details copied onto the club's upcoming events.
 */
const id = z.coerce.number();
const text = z.string().nullish().transform((v) => v ?? "");

export const photoSchema = z.object({ thumbnail: z.string().nullish(), medium: z.string().nullish() }).nullish();
export const linksSchema = z.record(z.string().nullish()).catch({});
export const lastTalkSchema = z.object({ event_id: id, event_name: text, date: z.string().nullish() }).nullish();

export const LINK_ORDER = ["linkedin", "website", "github", "x", "other"] as const;
export const LINK_LABEL: Record<string, string> = { website: "Website", linkedin: "LinkedIn", x: "X", github: "GitHub", other: "Link" };

const summary = {
  profile_id: id.optional(),
  id: id.optional(),
  slug: z.string().nullish(),
  name: z.string(),
  headline: z.string().nullish(),
  photo: photoSchema,
  bio: z.string().nullish(),
  links: linksSchema,
  city: z.string().nullish(),
  status: z.string().nullish(),
  claimed: z.boolean().catch(false),
  talks_count: z.coerce.number().catch(0),
  last_talk: lastTalkSchema,
};

/** A speaker the picker offers: the club's own past speakers first (`own`), then claimed public profiles. */
export const suggestionSchema = z
  .object({ ...summary, own: z.boolean().catch(true) })
  .transform(({ id: rowId, profile_id, ...s }) => ({ ...s, profile_id: profile_id ?? rowId ?? 0 }));
export type Suggestion = z.infer<typeof suggestionSchema>;
export const suggestionsSchema = z.array(suggestionSchema);

export const contactSchema = z.object({
  email: z.string().nullish(),
  phone: z.string().nullish(),
  notes: z.string().nullish(),
  consent_at: z.string().nullish(),
  consent_by: z.string().nullish(),
});
export type SpeakerContact = z.infer<typeof contactSchema>;

export const clubSpeakerSchema = z
  .object({ ...summary, contact: contactSchema.nullish() })
  .transform(({ id: rowId, profile_id, ...s }) => ({ ...s, profile_id: profile_id ?? rowId ?? 0 }));
export type ClubSpeaker = z.infer<typeof clubSpeakerSchema>;
export const clubSpeakerPageSchema = z.object({ items: z.array(clubSpeakerSchema), total: z.coerce.number().catch(0) });

export const talkSchema = z.object({
  event_id: id,
  event_name: text,
  date: z.string().nullish(),
  talk_title: z.string().nullish(),
  status: z.string().nullish(),
  sessions: z.array(z.object({ title: text, starts_at: z.string().nullish() })).catch([]),
});
export type ClubTalk = z.infer<typeof talkSchema>;

export const clubSpeakerDetailSchema = z
  .object({ ...summary, own: z.boolean().catch(true), talks: z.array(talkSchema).catch([]), contact: contactSchema.nullish() })
  .transform(({ id: rowId, profile_id, ...s }) => ({ ...s, profile_id: profile_id ?? rowId ?? 0 }));
export type ClubSpeakerDetail = z.infer<typeof clubSpeakerDetailSchema>;

/** The link an event's speaker row carries: the profile's LinkedIn, else its site, else any web link. */
export function primaryLink(links: Record<string, string | null | undefined>): string {
  for (const k of LINK_ORDER) {
    const v = links[k];
    if (v && /^https?:\/\//i.test(v)) return v;
  }
  return "";
}

/**
 * The club's contact for a speaker, as it is about to be saved: an email or
 * a phone the club did not have before needs the tick that the speaker
 * agreed (the API refuses it otherwise, 422 CONSENT_REQUIRED).
 */
export function needsConsent(saved: SpeakerContact | null | undefined, next: { email: string; phone: string }): boolean {
  const email = next.email.trim().toLowerCase();
  const phone = next.phone.trim();
  const newEmail = Boolean(email) && email !== (saved?.email ?? "").toLowerCase();
  const newPhone = Boolean(phone) && phone !== (saved?.phone ?? "");
  return newEmail || newPhone;
}

/** What "Last talk" says: the event and its date. */
export function lastTalkLabel(t: { event_name: string; date?: string | null | undefined } | null | undefined, format: (d: string) => string): string {
  if (!t) return "—";
  return t.date ? `${t.event_name} · ${format(t.date)}` : t.event_name;
}
