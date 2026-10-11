import { z } from "zod";

/** Whose links: one event's, counting registrations; or the club page's, counting follows. */
export type LinkScope = { kind: "event"; eventId: number } | { kind: "club" };

export const linkSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  url: z.string(),
  destination: z.string(),
  utm_source: z.string(),
  utm_medium: z.string(),
  utm_campaign: z.string().nullable(),
  utm_content: z.string().nullable(),
  clicks: z.number(),
  uniques: z.number(),
  conversions: z.number(),
  rate: z.number(),
  second: z.number(),
  created_at: z.string(),
});

export const linksSummarySchema = z.object({
  scope: z.enum(["event", "club"]),
  period_days: z.number(),
  conversion_noun: z.string(),
  second_noun: z.string(),
  links: z.array(linkSchema).default([]),
  by_source: z.array(z.object({ source: z.string(), clicks: z.number(), conversions: z.number(), rate: z.number() })).default([]),
  totals: z.object({
    clicks: z.number(),
    conversions: z.number(),
    rate: z.number(),
    share_of_all: z.number(),
    best_source: z.string().nullable(),
    best_conversions: z.number(),
  }),
  deltas: z.object({ clicks: z.number().nullable(), conversions: z.number().nullable(), rate_pts: z.number().nullable() }),
  untracked: z.object({ conversions: z.number(), total: z.number() }),
  generated_at: z.string(),
});

export type TrackingLink = z.infer<typeof linkSchema>;
export type LinksSummary = z.infer<typeof linksSummarySchema>;

export const linkFormSchema = z.object({
  name: z.string().trim().min(1, "Name the link so you know where it went").max(80),
  utm_source: z.string().trim().min(1, "Where will you share it?").max(60),
  utm_medium: z.string().trim().min(1, "How does it reach people?").max(60),
  utm_campaign: z.string().trim().max(80).optional(),
  utm_content: z.string().trim().max(80).optional(),
});
export type LinkForm = z.infer<typeof linkFormSchema>;

/** Where clubs share things, with the medium each implies. */
export const SOURCES = [
  { value: "instagram", label: "Instagram", medium: "social" },
  { value: "whatsapp", label: "WhatsApp", medium: "messaging" },
  { value: "poster_qr", label: "Poster QR", medium: "print" },
  { value: "email", label: "Email", medium: "email" },
  { value: "linkedin", label: "LinkedIn", medium: "social" },
  { value: "facebook", label: "Facebook", medium: "social" },
  { value: "twitter", label: "X / Twitter", medium: "social" },
  { value: "website", label: "Website", medium: "referral" },
  { value: "other", label: "Other", medium: "other" },
] as const;

export const MEDIUMS = ["social", "messaging", "print", "email", "referral", "ad", "other"] as const;

export const PERIODS = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
  { value: 3650, label: "All time" },
] as const;

/** A source's label, for the ones we know; the tag itself for the rest. */
export function sourceLabel(source: string): string {
  return SOURCES.find((s) => s.value === source)?.label ?? source;
}
