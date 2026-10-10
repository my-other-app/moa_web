import { z } from "zod";

/**
 * Where a design came from.
 *
 * The editor says this out loud, because "you are editing the club's default"
 * and "you are editing this event's design" look identical on screen and have
 * very different consequences.
 */
export const DESIGN_SOURCES = [
  "event_role",
  "event_default",
  "club_default",
  "system",
] as const;

export const designResponseSchema = z.object({
  config: z.record(z.unknown()).default({}),
  audience: z.string(),
  source: z.enum(DESIGN_SOURCES),
  /** True once the event owns this design, so a reset has something to undo. */
  is_own: z.boolean().default(false),
  template_id: z.number().nullish(),
});

export type DesignResponse = z.infer<typeof designResponseSchema>;

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

export const DESIGN_KINDS = ["ticket", "certificate"] as const;
export type DesignKind = (typeof DESIGN_KINDS)[number];

/** What the source means, in words a club can act on. */
export function describeSource(source: DesignResponse["source"]): string {
  switch (source) {
    case "event_role":
      return "This event's design for this group.";
    case "event_default":
      return "This event's own design.";
    case "club_default":
      return "Your club's default. Saving makes a copy for this event only.";
    default:
      return "The built-in design. Saving makes a copy for this event only.";
  }
}
