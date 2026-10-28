import { imageFieldSchema } from "@moa/app-kit";
import { z } from "zod";

/**
 * An event's own sponsors and partners (backend docs/EVENT_PARTNERS.md):
 * logos on the event's public page, in the website and the app. Not the
 * club's year-round partners, which live on the club profile; those can be
 * copied onto an event.
 */
export const PARTNER_KINDS = ["sponsor", "partner"] as const;
export type PartnerKind = (typeof PARTNER_KINDS)[number];

/** Live rows an event may list, sponsors and partners together. */
export const MAX_EVENT_PARTNERS = 50;
export const NAME_MAX = 100;
export const LABEL_MAX = 60;
export const LINK_MAX = 500;

export const KIND_WORDS: Record<PartnerKind, { one: string; many: string; One: string; Many: string }> = {
  sponsor: { one: "sponsor", many: "sponsors", One: "Sponsor", Many: "Sponsors" },
  partner: { one: "partner", many: "partners", One: "Partner", Many: "Partners" },
};

export const eventPartnerSchema = z.object({
  id: z.coerce.number(),
  kind: z.enum(PARTNER_KINDS),
  name: z.string(),
  label: z.string().nullish(),
  link: z.string().nullish(),
  position: z.number().default(0),
  logo: imageFieldSchema.catch(null),
  club_partner_id: z.number().nullish(),
});
export type EventPartner = z.infer<typeof eventPartnerSchema>;

export const eventPartnerListSchema = z.array(eventPartnerSchema);

export const fromClubResultSchema = z.object({
  added: eventPartnerListSchema,
  skipped: z.array(z.number()).catch([]),
});
export type FromClubResult = z.infer<typeof fromClubResultSchema>;

const HTTPS = /^https:\/\/[^\s/?#]+\.[^\s/?#]+(?:[/?#]\S*)?$/i;

/**
 * A link as typed, ready for the server, which takes https:// only: trimmed,
 * and a bare address ("kinetic.in/events") given https://. An http:// link
 * is left as it is, so the form can say what is wrong with it.
 */
export function normaliseLink(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return v;
  return `https://${v.replace(/^\/+/, "")}`;
}

export function isHttpsLink(v: string): boolean {
  return HTTPS.test(v);
}

/** One row as the organiser types it: a name, a label and a link, all words. */
export const partnerDraftSchema = z.object({
  name: z.string().trim().min(1, "Name the sponsor or partner").max(NAME_MAX, `Keep the name under ${NAME_MAX} characters`),
  label: z.string().trim().max(LABEL_MAX, `Keep the label under ${LABEL_MAX} characters`),
  link: z
    .string()
    .max(LINK_MAX + 20, `Keep the link under ${LINK_MAX} characters`)
    .transform(normaliseLink)
    .refine((v) => v === "" || isHttpsLink(v), "Use a link that starts with https://")
    .refine((v) => v.length <= LINK_MAX, `Keep the link under ${LINK_MAX} characters`),
});
export type PartnerDraft = z.input<typeof partnerDraftSchema>;
export type PartnerForm = z.output<typeof partnerDraftSchema>;

export const emptyDraft: PartnerDraft = { name: "", label: "", link: "" };

export function draftOf(p: EventPartner): PartnerDraft {
  return { name: p.name, label: p.label ?? "", link: p.link ?? "" };
}

/** Sponsors and partners, each in its order. */
export function byKind(rows: readonly EventPartner[]): Record<PartnerKind, EventPartner[]> {
  const sorted = [...rows].sort((a, b) => a.position - b.position || a.id - b.id);
  return { sponsor: sorted.filter((r) => r.kind === "sponsor"), partner: sorted.filter((r) => r.kind === "partner") };
}

/** `ids` with the one at `index` moved by `by` (-1 up, +1 down); null at an end. */
export function moved(ids: readonly number[], index: number, by: -1 | 1): number[] | null {
  const to = index + by;
  if (index < 0 || index >= ids.length || to < 0 || to >= ids.length) return null;
  const next = [...ids];
  [next[index], next[to]] = [next[to]!, next[index]!];
  return next;
}

/**
 * Whether the event's detail (GET /events/info/{id}) comes from a server that
 * has sponsors and partners: it carries a `sponsors` list. An older server
 * does not, and the editor hides the section rather than offer what would 404.
 */
export function partnersSupported(detail: unknown): boolean {
  return Array.isArray((detail as { sponsors?: unknown } | null | undefined)?.sponsors);
}
