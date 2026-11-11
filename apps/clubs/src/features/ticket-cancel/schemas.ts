import { z } from "zod";

/**
 * "Give your ticket back" (feature-register/ticket-self-cancel-contract.md):
 * a guest with a free ticket gives it back by the link in their emails,
 * before the event starts. They leave the list exactly as the club's own
 * removal takes them off it, and the place goes to the waiting list.
 *
 * The list leaves them out, so the club reads who gave theirs back from
 * GET /events/registration/{event_id}/cancellations, newest first:
 * `{items: [{registration_id, full_name, email, ticket_id, reason,
 * cancelled_at, cancelled_by: "attendee"}]}`.
 */
export const givenBackSchema = z.object({
  registration_id: z.union([z.string(), z.number()]).transform(String),
  full_name: z.string().nullish().transform((v) => v ?? ""),
  email: z.string().nullish().transform((v) => v ?? ""),
  ticket_id: z.string().nullish().transform((v) => v ?? ""),
  /** What they said, when they said anything (300 characters at most). */
  reason: z.string().nullish().transform((v) => (v ?? "").trim()),
  cancelled_at: z.string().nullish(),
  cancelled_by: z.string().catch("attendee"),
});
export type GivenBack = z.infer<typeof givenBackSchema>;

export const givenBackListSchema = z.object({
  items: z.array(z.unknown()).catch([]).transform((items) => items.flatMap((i) => {
    const row = givenBackSchema.safeParse(i);
    return row.success ? [row.data] : [];
  })),
});

/** The switch in the event form, and what it says. */
export const SELF_CANCEL_LABEL = "Attendees can give their ticket back";
export const SELF_CANCEL_HELP = "Their ticket emails carry a link to give it back. Only free tickets, and only before the event starts.";
