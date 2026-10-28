import { z } from "zod";

/**
 * GET /clubs/overview — everything the dashboard shows, in one response.
 *
 * Written by hand rather than generated: the backend publishes these fields
 * as `anyOf: [string, {}]` (see @moa/api's zod-helpers for why), which
 * generates as `unknown`. Validating here gives the screen real types and
 * fails loudly if the shape changes.
 */

/** A figure with its previous-period comparison. */
export const kpiSchema = z.object({
  value: z.number().nullable(),
  previous: z.number().nullable(),
  /* Null when there is nothing to compare against -- a club's first month.
     "+100%" against nothing is a number someone repeats out loud. */
  delta: z.number().nullable(),
});

export const overviewEventSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  event_datetime: z.string().nullish(),
  location_name: z.string().nullish(),
  has_fee: z.boolean().default(false),
  reg_fee: z.number().nullish(),
  page_views: z.number().default(0),
  registrations: z.number().default(0),
  attended: z.number().default(0),
  /* Null rather than 0 where there is no denominator: zero turnout of zero
     people is not 0%, it is not a rate, and 0% invites someone to chase a
     club that did nothing wrong. */
  view_to_signup: z.number().nullable(),
  turnout: z.number().nullable(),
  /** Registration requests waiting for the club to confirm them (0 from an API without requests). */
  requests_pending: z.number().catch(0),
  /**
   * Everyone who asked for a place on an event that confirms each
   * registration (null: an older server, or an event that never asked).
   */
  requests_total: z.number().nullish().catch(null).transform((v) => (v === null || v === undefined ? null : Math.max(0, Math.trunc(v)))),
});

export const seriesPointSchema = z.object({
  date: z.string(),
  revenue: z.number().default(0),
  registrations: z.number().default(0),
});

export const clubOverviewSchema = z.object({
  generated_at: z.string().nullish(),
  period_days: z.number().default(30),
  kpis: z.object({
    registrations: kpiSchema,
    page_views: kpiSchema,
    revenue: kpiSchema,
    attendance_rate: kpiSchema,
  }),
  revenue_series: z.object({
    current: z.array(seriesPointSchema).default([]),
    previous: z.array(seriesPointSchema).default([]),
  }),
  busiest_day: z
    .array(z.object({ label: z.string(), value: z.number().default(0) }))
    .default([]),
  repeat_rate: z.number().nullable(),
  followers: z.object({
    total: z.number().default(0),
    series: z
      .array(z.object({ week: z.string(), value: z.number().default(0) }))
      .default([]),
  }),
  next_event: overviewEventSchema.nullable(),
  upcoming: z.array(overviewEventSchema).default([]),
  needs_attention: z.array(overviewEventSchema).default([]),
  needs_attention_total: z.number().default(0),
  reach: z.array(overviewEventSchema).default([]),
});

export type ClubOverview = z.infer<typeof clubOverviewSchema>;
export type OverviewEvent = z.infer<typeof overviewEventSchema>;
export type Kpi = z.infer<typeof kpiSchema>;

export const PERIOD_OPTIONS = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
] as const;

/** One decision the dashboard's attention card lists, as the club pulse sends them. */
interface PulseItem {
  kind: string;
  tone: "red" | "amber";
  title: string;
  body: string;
  event_id: number | null;
}

/**
 * "N registrations to review", one per event that has registrations under
 * review, from the overview's events: unless the pulse already said it for
 * that event (a server that puts it among its attention items). The link is
 * the event's Review tab (attentionPath, REQUESTS_PENDING).
 */
export function pendingRequestItems(o: Pick<ClubOverview, "next_event" | "upcoming" | "needs_attention" | "reach">, pulse: readonly PulseItem[] = []): PulseItem[] {
  const said = new Set(pulse.filter((p) => p.kind === "REQUESTS_PENDING").map((p) => p.event_id));
  const seen = new Set<number>();
  const out: PulseItem[] = [];
  for (const e of [...(o.next_event ? [o.next_event] : []), ...o.upcoming, ...o.needs_attention, ...o.reach]) {
    if (seen.has(e.id) || said.has(e.id) || e.requests_pending <= 0) continue;
    seen.add(e.id);
    const n = e.requests_pending;
    out.push({
      kind: "REQUESTS_PENDING",
      tone: "amber",
      title: `${n.toLocaleString("en-IN")} ${n === 1 ? "registration" : "registrations"} to review`,
      body: `For ${e.name}. Confirm or decline each one: confirmed people get their ticket by email.`,
      event_id: e.id,
    });
  }
  return out;
}
