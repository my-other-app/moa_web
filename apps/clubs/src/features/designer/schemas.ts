import { z } from "zod";
import { PageSpec, TicketCanvas, TicketLayer } from "@moa/layout";

/**
 * Who a design is for.
 *
 * `event_default` is one design for the whole event, which is the common case
 * and stays the default. The rest are variants, used only when a club wants a
 * speaker's badge to differ from an attendee's.
 */
export const AUDIENCES = [
  { value: "event_default", label: "Everyone" },
  { value: "attendee", label: "Attendees" },
  { value: "speaker", label: "Speakers" },
  { value: "staff", label: "Staff" },
] as const;
export type Audience = (typeof AUDIENCES)[number]["value"];

export const DESIGN_KINDS = ["ticket", "badge", "certificate", "agenda"] as const;
export type DesignKind = (typeof DESIGN_KINDS)[number];

/**
 * Whose design the editor is on: one event's own, or the club's default
 * that every event starts from. The routes differ; the editor does not.
 */
export type DesignScope = { kind: "event"; eventId: number } | { kind: "club" };

export const starterSchema = z.object({
  canvas: TicketCanvas,
  layers: z.array(TicketLayer),
  page: PageSpec,
});

const tokenSchema = z.object({
  key: z.string(),
  group: z.string(),
  label: z.string(),
  sample: z.string(),
  note: z.string().nullish(),
});
export type DesignToken = z.infer<typeof tokenSchema>;

/** The design and everything the editor needs around it -- what GET /layout answers. */
export const layerDesignSchema = z.object({
  eventId: z.number(),
  kind: z.enum(DESIGN_KINDS),
  audience: z.string(),
  canvas: TicketCanvas,
  layers: z.array(TicketLayer),
  page: PageSpec,
  version: z.number().default(0),
  /** True once the event owns this design for this audience, so a reset has something to undo. */
  isOwn: z.boolean().default(false),
  /** Nothing saved yet anywhere up the chain: the editor opened on a starter. */
  fromStarter: z.boolean().default(false),
  templateUrl: z.string().nullish(),
  /** Image keys the layers point at, resolved to URLs the browser can show. */
  imageUrls: z.record(z.string()).default({}),
  brand: z.object({
    orgName: z.string().default(""),
    primary: z.string(),
    secondary: z.string(),
    logoUrl: z.string().nullish(),
  }),
  eventIconUrl: z.string().nullish(),
  starters: z.record(z.object({ label: z.string(), note: z.string() })),
  tokens: z.array(tokenSchema),
  qrRequired: z.boolean(),
  /** What the canvas fills tokens with, made by the same code the renderer uses. */
  sampleValues: z.record(z.string()).default({}),
  /** The run of show an agenda layer draws on the stage: the event's own sessions, or samples while it has none. */
  agenda: z.array(z.object({ startsAt: z.string(), endsAt: z.string().nullable(), title: z.string(), speaker: z.string().nullable(), location: z.string().nullable() })).default([]),
  /** The zone an agenda layer's times read in. */
  timezone: z.string().default("Asia/Kolkata"),
});
export type LayerDesign = z.infer<typeof layerDesignSchema>;

export const uploadedImageSchema = z.object({
  key: z.string(),
  url: z.string(),
  width: z.number().nullish(),
  height: z.number().nullish(),
});
