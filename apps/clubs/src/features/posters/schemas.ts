import { POSTER_FORMATS, type PosterFormat } from "@moa/layout";
import { z } from "zod";

/**
 * Guest posters, the organiser's side (feature-register/posters/CONTRACT.md
 * §10): the event's switch, its three moments, the formats it offers, and
 * the numbers. Every field read leniently, so an answer with a field more
 * or less never takes the page down.
 */

export const MOMENTS = ["before", "during", "after"] as const;
export type MomentKey = (typeof MOMENTS)[number];

/** When each moment is reached, and what it is called, as the contract's rules have it (§5). */
export const MOMENT_INFO: Record<MomentKey, { title: string; when: string; phrase: string }> = {
  before: { title: "Before the event", when: "Once their ticket is sent.", phrase: "I'm attending" },
  during: { title: "During the event", when: "Once they are checked in, until the event ends.", phrase: "I'm here at" },
  after: { title: "After the event", when: "Once the event is over, for everyone whose ticket was sent or who came.", phrase: "I attended" },
};

export const DEFAULT_CAPTION = "{{moment_phrase}} {{event_name}}! Join me: {{share_url}}";
export const PHRASE_MAX = 60;
export const CAPTION_MAX = 500;

const momentSchema = z.object({
  enabled: z.boolean().catch(false),
  phrase: z.string().catch(""),
  caption: z.string().catch(DEFAULT_CAPTION),
});
export type Moment = z.infer<typeof momentSchema>;

const formatKey = z.enum(POSTER_FORMATS);

export const posterSettingsSchema = z.object({
  enabled: z.boolean().catch(false),
  formats: z
    .array(z.string())
    .catch([...POSTER_FORMATS])
    .transform((v) => POSTER_FORMATS.filter((f) => v.includes(f))),
  moments: z
    .object({ before: momentSchema.optional(), during: momentSchema.optional(), after: momentSchema.optional() })
    .catch({})
    .transform((m) =>
      Object.fromEntries(
        MOMENTS.map((k) => [k, m[k] ?? { enabled: k === "before", phrase: MOMENT_INFO[k].phrase, caption: DEFAULT_CAPTION }])
      ) as Record<MomentKey, Moment>
    ),
  available_formats: z
    .array(z.object({ key: z.string(), width: z.number().nullish(), height: z.number().nullish(), label: z.string().nullish() }))
    .catch([]),
  poster_url_token: z.string().catch("{{poster_url}}"),
  updated_at: z.string().nullish().catch(null),
});
export type PosterSettings = z.infer<typeof posterSettingsSchema>;

/** What a save sends: any part of the settings. */
export interface PosterSettingsPatch {
  enabled?: boolean;
  formats?: PosterFormat[];
  moments?: Partial<Record<MomentKey, Partial<Moment>>>;
}

const count = z.number().catch(0);

export const posterStatsSchema = z.object({
  enabled: z.boolean().catch(false),
  guests_eligible: count,
  posters_made: count,
  with_photo: count,
  renders: count,
  downloads: count,
  shares: count,
  copies: count,
  link_clicks: count,
  link_uniques: count,
  registrations: count,
  requests: count,
  checked_in: count,
  by_moment: z.record(z.number()).catch({}),
  by_format: z.record(z.number()).catch({}),
  top: z
    .array(
      z.object({
        name: z.string().catch(""),
        role: z.string().nullish().catch(null),
        clicks: count,
        registrations: count,
        requests: count,
      })
    )
    .catch([]),
  tracking_link_id: z.string().nullish().catch(null),
});
export type PosterStats = z.infer<typeof posterStatsSchema>;

export const isFormat = (v: string): v is PosterFormat => formatKey.safeParse(v).success;
