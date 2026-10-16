import { z } from "zod";

export const TEMPLATES = ["launchpad", "chapter", "campus", "arena"] as const;
export const THEMES = ["light", "dark"] as const;
export const FONTS = ["dm_sans", "inter", "fraunces", "space_grotesk", "manrope"] as const;
export const SECTIONS = ["hero", "upcoming", "about", "past", "team", "partners", "follow", "contact"] as const;
export type Template = (typeof TEMPLATES)[number];
export type Theme = (typeof THEMES)[number];
export type Font = (typeof FONTS)[number];
export type Section = (typeof SECTIONS)[number];

export const SECTION_LABEL: Record<Section, string> = { hero: "Hero", upcoming: "Upcoming events", about: "About and numbers", past: "Past events", team: "Team", partners: "Partners", follow: "Follow banner", contact: "Contact footer" };
export const SECTION_EMPTY: Partial<Record<Section, string>> = { past: "No past events yet", team: "Add people on Club profile", partners: "Add partners on Club profile" };

export const siteSchema = z.object({
  template: z.enum(TEMPLATES),
  theme: z.enum(THEMES),
  font: z.enum(FONTS),
  headline: z.string().nullable(),
  subline: z.string().nullable(),
  default_headline: z.string(),
  default_subline: z.string().nullable(),
  sections: z.record(z.string(), z.boolean()),
  available: z.record(z.string(), z.boolean()),
  published_at: z.string().nullable(),
  stale: z.boolean(),
  url: z.string(),
  slug: z.string(),
  templates: z.array(z.object({ key: z.string(), name: z.string(), blurb: z.string() })),
  fonts: z.array(z.object({ key: z.string(), name: z.string() })),
  /** The site's own tracking link once it is published (absent from a server without site tracking). */
  tracking: z.object({ link_id: z.string(), code: z.string(), short_url: z.string() }).nullable().optional().catch(null),
});
export type Site = z.infer<typeof siteSchema>;

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

export type SitePatch = Partial<{ template: Template; theme: Theme; font: Font; headline: string | null; subline: string | null; sections: Record<string, boolean> }>;
