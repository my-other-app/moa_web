import { z } from "zod";

/*
 * The club's website, as the API describes it.
 *
 * Two servers answer GET /clubs/site:
 * - **v2** (the designer's ten templates): each template lists its sections
 *   and image slots, the site has a `layout` (section order, hidden ones,
 *   titles, which library photo goes in which slot, the accent) and a photo
 *   library (`images`, `limits`).
 * - **before v2**: four templates by name, a light/dark look, a font, and
 *   sections that only switch on and off (`sections`, `available`).
 * Every v2 field is optional here, so the page reads either; `isV2` says
 * which it is talking to, and the parts the older server cannot keep stay
 * hidden until it can (the repo's ahead-of-backend pattern).
 */

/** A section's title the club may write over the template's (layout.titles). */
export const TITLE_MAX = 60;
export const HEADLINE_MAX = 120;
export const SUBLINE_MAX = 240;
/** The club's own line for the Join section (layout.join_text). */
export const JOIN_TEXT_MAX = 240;
/** What the Join section says when the club writes nothing (the server's default). */
export const JOIN_TEXT_DEFAULT = "Joining is free. Follow us to hear about every event first.";
/** The API's refusal of a Join line over 240 characters. */
export const JOIN_TEXT_TOO_LONG = "SITE_JOIN_TEXT_TOO_LONG";
/** A library photo's alt text. */
export const ALT_MAX = 200;
/** What the library holds and each photo may weigh, when the server does not say. */
export const DEFAULT_LIMITS = { images: 20, image_mb: 10 } as const;
/** Gallery slots are `photos.1 … photos.N`; unassigned ones fill from the library. */
export const GALLERY_PREFIX = "photos.";
/** The formats the photo library takes (the API's own list). */
export const PHOTO_TYPES: readonly string[] = ["image/jpeg", "image/png", "image/webp"];

/** Canonical section keys (the contract's), for rows the template fixes in place. */
export const SECTION_WORDS: Record<string, string> = {
  nav: "Navigation",
  hero: "Hero",
  profile: "Profile column",
  about: "About",
  expertise: "Expertise",
  stats: "Numbers",
  upcoming: "Upcoming events",
  past: "Past events",
  photos: "Photos",
  speakers: "Speakers",
  team: "Team",
  sponsors: "Sponsors and partners",
  join: "Join",
  footer: "Footer",
};

/** The older server's sections and what each is called (it sends only their keys). */
export const LEGACY_SECTION_LABEL: Record<string, string> = {
  hero: "Hero",
  upcoming: "Upcoming events",
  about: "About and numbers",
  past: "Past events",
  team: "Team",
  partners: "Partners",
  follow: "Follow banner",
  contact: "Contact footer",
};
export const LEGACY_SECTION_EMPTY: Record<string, string> = { past: "No past events yet", team: "Add people on Club profile", partners: "Add partners on Club profile" };

const sectionMetaSchema = z.object({
  key: z.string(),
  label: z.string(),
  default_title: z.string().nullable().optional().catch(null),
  hideable: z.boolean().optional().catch(true),
});
export type SectionMeta = z.infer<typeof sectionMetaSchema>;

/** [width, height] as an array (the contract) or {w, h} / {width, height}. */
const sizeSchema = z
  .union([
    z.tuple([z.number(), z.number()]),
    z.object({ w: z.number(), h: z.number() }).transform((s): [number, number] => [s.w, s.h]),
    z.object({ width: z.number(), height: z.number() }).transform((s): [number, number] => [s.width, s.height]),
  ])
  .nullable()
  .optional()
  .catch(null);

const slotMetaSchema = z.object({
  key: z.string(),
  label: z.string(),
  size: sizeSchema,
  section: z.string().nullable().optional().catch(null),
});
export type SlotMeta = z.infer<typeof slotMetaSchema>;

const keys = z.array(z.string()).optional().catch([]);

export const templateSchema = z.object({
  key: z.string(),
  name: z.string(),
  blurb: z.string().optional().catch(""),
  layout: z.enum(["single", "two_column"]).optional().catch("single"),
  /** The movable sections in their default order; absent from a server before v2. */
  sections: z.array(sectionMetaSchema).optional().catch(undefined),
  slots: z.array(slotMetaSchema).optional().catch([]),
  /** The sections the template keeps in place: {top, side, bottom} (or, in the contract's sketch, fixed_top / fixed_side / fixed_bottom). */
  fixed: z.object({ top: keys, side: keys, bottom: keys }).optional().catch(undefined),
  fixed_top: keys,
  fixed_side: keys,
  fixed_bottom: keys,
  thumb_url: z.string().nullable().optional().catch(null),
  thumb_mobile_url: z.string().nullable().optional().catch(null),
  /** The template's own accent, when the server sends it ("#2B4BFF" or {default}). */
  accent: z
    .union([z.string(), z.object({ default: z.string().nullable().optional() }).transform((a) => a.default ?? null)])
    .nullable()
    .optional()
    .catch(null),
});
export type SiteTemplate = z.infer<typeof templateSchema>;

/** The rows a template fixes in place, whichever way the server writes them. */
export function fixedOf(t: SiteTemplate | undefined): { top: string[]; side: string[]; bottom: string[] } {
  return {
    top: t?.fixed?.top ?? t?.fixed_top ?? [],
    side: t?.fixed?.side ?? t?.fixed_side ?? [],
    bottom: t?.fixed?.bottom ?? t?.fixed_bottom ?? [],
  };
}

export const HEX = /^#[0-9a-fA-F]{6}$/;

export const layoutSchema = z.object({
  order: z.array(z.string()).catch([]),
  hidden: z.array(z.string()).catch([]),
  titles: z.record(z.string(), z.string()).catch({}),
  /** slot key → library image id; a null (a cleared slot) is dropped. */
  slots: z
    .record(z.string(), z.number().nullable())
    .catch({})
    .transform((s) => Object.fromEntries(Object.entries(s).filter((e): e is [string, number] => typeof e[1] === "number"))),
  accent: z.string().regex(HEX).nullable().optional().catch(null).transform((a) => a ?? null),
  /** The Join section's line, plain text; null for the default (absent from a server before it). */
  join_text: z.string().nullable().optional().catch(null).transform((t) => t ?? null),
});
export type Layout = {
  order: string[];
  hidden: string[];
  titles: Record<string, string>;
  slots: Record<string, number>;
  accent: string | null;
  /** In the draft, as typed; layoutFor trims it (an empty one is null). */
  join_text: string | null;
};
/**
 * The layout as PATCH and the preview take it: `order` and `hidden`
 * replace; `titles` and `slots` merge by key, a null clearing one (back to
 * the template's title, an empty slot); `accent` sets, or null for the
 * template's own; `join_text`, sent only when it changed, sets the Join
 * section's line, or null for the default.
 */
export type LayoutPatch = {
  order: string[];
  hidden: string[];
  titles: Record<string, string | null>;
  slots: Record<string, number | null>;
  accent: string | null;
  join_text?: string | null;
};

export const siteImageSchema = z.object({
  id: z.number(),
  /** Null while the picture cannot be shown (no CDN and no signed link). */
  url: z.string().nullable(),
  srcset: z.string().nullable().optional().catch(null),
  alt: z.string().nullable().optional().catch(null),
  width: z.number().nullable().optional().catch(null),
  height: z.number().nullable().optional().catch(null),
  position: z.number().optional().catch(0),
  /** The saved template's slots it shows in (chosen, or filling the gallery); the editor works this out itself for the draft. */
  used_in: z.array(z.string()).optional().catch([]),
});
export type SiteImage = z.infer<typeof siteImageSchema>;

export const siteSchema = z.object({
  template: z.string(),
  headline: z.string().nullable(),
  subline: z.string().nullable(),
  default_headline: z.string(),
  default_subline: z.string().nullable(),
  published_at: z.string().nullable(),
  stale: z.boolean(),
  url: z.string(),
  slug: z.string(),
  templates: z.array(templateSchema),
  /** The site's own tracking link once it is published (absent from a server without site tracking). */
  tracking: z.object({ link_id: z.string(), code: z.string(), short_url: z.string() }).nullable().optional().catch(null),
  // ── v2 ──
  layout: layoutSchema.nullable().optional().catch(null),
  images: z.array(siteImageSchema).nullable().optional().catch(null),
  limits: z.object({ images: z.number().catch(DEFAULT_LIMITS.images), image_mb: z.number().catch(DEFAULT_LIMITS.image_mb) }).nullable().optional().catch(null),
  /** The club's brand colour, for the accent switch. */
  club_colour: z.string().nullable().optional().catch(null),
  /** After a PATCH: what the server's layout check changed in what was sent (order_dropped, order_appended, hidden_dropped, titles_dropped). */
  adjusted: z.record(z.string(), z.array(z.string())).nullable().optional().catch(null),
  // ── before v2 ──
  sections: z.record(z.string(), z.boolean()).optional().catch(undefined),
  available: z.record(z.string(), z.boolean()).optional().catch(undefined),
});
export type Site = z.infer<typeof siteSchema>;

/** A server with the designer's templates: the site has a layout to edit. */
export function isV2(site: Site): boolean {
  return site.layout !== null && site.layout !== undefined;
}

const n = z.number().catch(0);
export const siteAnalyticsSchema = z.object({
  published: z.boolean(),
  days: z.number(),
  link: z.object({ id: z.string(), code: z.string(), short_url: z.string(), destination: z.string() }).nullable(),
  visits: n,
  visitors: n,
  signups: n,
  came: n,
  follows: n,
  rate: n,
  deltas: z.object({ visits: z.number().nullable(), signups: z.number().nullable() }).catch({ visits: null, signups: null }),
  series: z.array(z.object({ day: z.string(), visits: n, signups: n })).catch([]),
  sources: z.array(z.object({ kind: z.enum(["website", "link"]).catch("link"), link_id: z.string(), name: z.string(), visits: n, signups: n, rate: n })).catch([]),
  referrers: z.array(z.object({ referrer: z.string(), visits: n })).catch([]),
  devices: z.array(z.object({ device: z.string(), visits: n })).catch([]),
  events: z.array(z.object({ event_id: z.number(), name: z.string(), signups: n, came: n })).catch([]),
});
export type SiteAnalytics = z.infer<typeof siteAnalyticsSchema>;

/**
 * What PATCH /clubs/site and POST /preview take. `layout` is v2's (always
 * sent whole, normalised for the template); `sections` is the older
 * server's on/off map.
 */
export type SitePatch = Partial<{ template: string; layout: LayoutPatch; headline: string | null; subline: string | null; sections: Record<string, boolean> }>;
