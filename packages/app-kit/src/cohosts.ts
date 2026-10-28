import { z } from "zod";

import { imageFieldSchema, type ImageField } from "./image";

/**
 * Co-hosted events (backend docs/COHOSTS.md, contract cohosts-contract.md):
 * a host club invites up to five other clubs to run one of its events with
 * it. What both dashboards read about it lives here, so the club dashboard
 * and the main portal name the same status the same way.
 *
 * Everything is additive on the server. A payload from before co-hosts has
 * no `cohosts` (null here), and the co-host routes answer a bare 404: the
 * screens then show nothing about co-hosting at all.
 */

/**
 * A club logo, as the co-host payloads send it: an object of sizes under
 * /events and /clubs, a plain URL under /discover. Both read as sizes here,
 * and anything malformed as no logo, so one odd logo never fails a list.
 */
export const cohostLogoSchema = z
  .union([
    z.string().transform((url): ImageField => (url ? { original: url, thumbnail: url, medium: url, large: url } : null)),
    imageFieldSchema,
  ])
  .catch(null)
  .transform((v): ImageField => v ?? null);

/** CohostRef / ClubPick's club: `{club_id, name, slug, logo}`. */
export const cohostRefSchema = z.object({
  club_id: z.coerce.number(),
  name: z.string(),
  slug: z.string().nullish(),
  logo: cohostLogoSchema,
});
export type CohostRef = z.infer<typeof cohostRefSchema>;

/**
 * An event payload's `cohosts`: the accepted co-hosts, in the order they
 * accepted. `null` when the server predates co-hosts (the field is absent),
 * which is how a screen knows to hide everything about them.
 */
export const cohostsField = z.array(cohostRefSchema).nullish().catch(null).transform((v) => v ?? null);

export const COHOST_STATUSES = ["invited", "accepted", "declined", "left", "removed", "cancelled", "expired"] as const;
export type CohostStatus = (typeof COHOST_STATUSES)[number];

/** The word each status reads as, in both dashboards (contract §2). */
export const COHOST_STATUS_LABEL: Record<CohostStatus, string> = {
  invited: "Invited",
  accepted: "Co-hosting",
  declined: "Declined",
  left: "Left",
  removed: "Removed",
  cancelled: "Cancelled",
  expired: "Expired",
};

/** Its StatusBadge tone: waiting is amber, co-hosting green, a no red, the rest quiet. */
export const COHOST_STATUS_TONE: Record<CohostStatus, "default" | "success" | "warning" | "destructive" | "info"> = {
  invited: "warning",
  accepted: "success",
  declined: "destructive",
  left: "default",
  removed: "default",
  cancelled: "default",
  expired: "default",
};

/** Pending or accepted: the invites that take one of the event's five places. */
export function isLiveCohost(status: CohostStatus): boolean {
  return status === "invited" || status === "accepted";
}

/**
 * A status this build does not know yet reads as one that is over (not
 * live, no buttons), rather than failing the whole list.
 */
const statusField = z.enum(COHOST_STATUSES).catch("expired");

/** One row of `event_cohosts`: one club, one event, one status (contract §2). */
export const cohostInviteSchema = z.object({
  id: z.coerce.number(),
  event_id: z.coerce.number().nullish(),
  club: cohostRefSchema,
  status: statusField,
  note: z.string().nullish().catch(null),
  invited_at: z.string().nullish(),
  expires_at: z.string().nullish(),
  responded_at: z.string().nullish(),
  ended_at: z.string().nullish(),
  invited_by: z.string().nullish().catch(null),
});
export type CohostInvite = z.infer<typeof cohostInviteSchema>;

/** GET /events/{id}/cohosts: the host, who is looking, and every invite (contract §3). */
export const cohostListingSchema = z.object({
  event_id: z.coerce.number(),
  host: cohostRefSchema,
  viewer_role: z.enum(["host", "cohost", "admin"]).catch("cohost"),
  can_manage: z.boolean().catch(false),
  limit: z.number().catch(5),
  slots_left: z.number().catch(0),
  items: z.array(cohostInviteSchema),
});
export type CohostListing = z.infer<typeof cohostListingSchema>;

/** "A", "A and B", "A, B and C": names as a sentence says them. */
export function joinNames(names: readonly string[]): string {
  const list = names.filter((n) => n.trim().length > 0);
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/**
 * "Hosted by A and B" / "Hosted by A, B and C" (contract §8): the host
 * first, then each co-host in the order they accepted. Just "Hosted by A"
 * with no co-hosts.
 */
export function hostedByText(host: { name: string } | null | undefined, cohosts: readonly { name: string }[] | null | undefined): string {
  const names = [host?.name ?? "", ...(cohosts ?? []).map((c) => c.name)];
  const text = joinNames(names);
  return text ? `Hosted by ${text}` : "";
}
