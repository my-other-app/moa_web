import {
  COHOST_STATUSES,
  EVENT_STATUSES,
  cohostRefSchema,
  imageFieldSchema,
  isLiveCohost,
  type CohostInvite,
  type CohostStatus,
} from "@moa/app-kit";
import { z } from "zod";

import type { Role } from "@/features/access/schemas";

export {
  COHOST_STATUS_LABEL,
  COHOST_STATUS_TONE,
  cohostInviteSchema,
  cohostListingSchema,
  cohostRefSchema,
  hostedByText,
  isLiveCohost,
  joinNames,
  type CohostInvite,
  type CohostListing,
  type CohostRef,
  type CohostStatus,
} from "@moa/app-kit";

/**
 * Co-hosted events, in the club dashboard (contract: feature-register/cohosts-contract.md).
 *
 * The host club invites up to five clubs; once one accepts, its team manages
 * the event like the host's own, each member with their own role, except
 * what stays with the host: refunds, cancelling, deleting, duplicating,
 * running retention now and choosing co-hosts. A co-host may leave.
 */

/** The live invites an event may hold (pending and accepted together). */
export const MAX_COHOSTS = 5;
/** What the host may write with an invite. */
export const NOTE_MAX = 300;
/** The search answers from two characters (a leading @ is ignored). */
export const SEARCH_MIN = 2;

/** GET /events/{id}/cohosts/search: a club, and whether it can be invited now. */
export const CLUB_PICK_STATES = ["invitable", "invited", "cohosting", "host"] as const;
export type ClubPickState = (typeof CLUB_PICK_STATES)[number];
export const clubPickSchema = cohostRefSchema.extend({
  // A state this build doesn't know: not invitable from here (the server is the judge).
  state: z.enum(CLUB_PICK_STATES).catch("invited"),
});
export type ClubPick = z.infer<typeof clubPickSchema>;
export const clubPicksSchema = z.object({ items: z.array(clubPickSchema) });

/** Why a club in the search can't be invited, as its button says it. */
export const PICK_LABEL: Record<ClubPickState, string> = {
  invitable: "Invite",
  invited: "Invited",
  cohosting: "Co-hosting",
  host: "Host",
};

/** What the search box holds, as the server wants it: trimmed, without a leading @. */
export function searchTerm(raw: string): string {
  return raw.trim().replace(/^@+/, "").trim();
}

/** The event inside an invitation (contract §4). */
export const invitationEventSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  slug: z.string().nullish(),
  poster: imageFieldSchema.catch(null),
  event_datetime: z.string().nullish(),
  ends_at: z.string().nullish(),
  location_name: z.string().nullish(),
  is_online: z.boolean().nullish(),
  status: z.enum(EVENT_STATUSES).nullish().catch(null),
  cohosts: z.array(cohostRefSchema).catch([]).default([]),
});

/** One invitation to the signed-in club: who asked, for which event, and where it stands. */
export const invitationSchema = z.object({
  id: z.coerce.number(),
  status: z.enum(COHOST_STATUSES).catch("expired"),
  note: z.string().nullish().catch(null),
  invited_at: z.string().nullish(),
  expires_at: z.string().nullish(),
  responded_at: z.string().nullish(),
  ended_at: z.string().nullish(),
  invited_by: z.string().nullish().catch(null),
  host: cohostRefSchema,
  event: invitationEventSchema,
});
export type Invitation = z.infer<typeof invitationSchema>;

/** GET /clubs/cohosts/invitations: `pending` is what the home card and the menu count. */
export const invitationsSchema = z.object({
  pending: z.number().catch(0),
  items: z.array(invitationSchema),
});
export type Invitations = z.infer<typeof invitationsSchema>;

/** Pending first (soonest to expire first), then the rest as the server sent them (newest first). */
export function splitInvitations(items: readonly Invitation[]): { pending: Invitation[]; past: Invitation[] } {
  const at = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : Number.POSITIVE_INFINITY);
  const pending = items.filter((i) => i.status === "invited").sort((a, b) => at(a.expires_at) - at(b.expires_at));
  return { pending, past: items.filter((i) => i.status !== "invited") };
}

// ─── Who may do what ────────────────────────────────────────────────────

/**
 * Answering an invitation and leaving an event are the club's owner's and
 * admins' (contract §7); editors and door staff read them. The server
 * refusing is what holds; this only keeps the buttons honest.
 */
export function canAnswerInvites(role: Role): boolean {
  return role === "owner" || role === "admin";
}
export const canLeaveEvent = canAnswerInvites;

/** What a host-only action is called in a reason ("Only Design Society can refund — they host this event."). */
export const HOST_ONLY = {
  refund: "refund",
  cancel: "cancel this event",
  delete: "delete this event",
  duplicate: "duplicate this event",
  retention: "run retention now",
  cohosts: "invite or remove co-hosts",
  menu: "duplicate, cancel or delete it",
} as const;
export type HostOnlyAction = keyof typeof HOST_ONLY;

/** The one line a co-host sees where a host-only button would be. */
export function hostOnlyReason(action: HostOnlyAction, hostName: string | null | undefined): string {
  const host = hostName?.trim() || "the host club";
  return `Only ${host} can ${HOST_ONLY[action]} — they host this event.`;
}

// ─── An event, as the signed-in club sees it ───────────────────────────

/** An event payload's `viewer_role` (null from a server before co-hosts). */
export type ViewerRole = "host" | "cohost";

/**
 * Whether the event's detail (GET /events/info/{id}) comes from a server
 * with co-hosts: it carries `cohosts` (a list) or `viewer_role`. An older
 * server sends neither, and every co-host screen stays out of the way.
 */
export function cohostsSupported(detail: unknown): boolean {
  if (!detail || typeof detail !== "object") return false;
  const d = detail as { cohosts?: unknown; viewer_role?: unknown };
  return Array.isArray(d.cohosts) || typeof d.viewer_role === "string";
}

/** An invite's one line of history: when it was sent and by whom, and what happened since. */
export function inviteHistory(i: Pick<CohostInvite, "status" | "invited_at" | "invited_by" | "responded_at" | "ended_at" | "expires_at">, now: Date, when: (iso: string) => string): string {
  const parts: string[] = [];
  if (i.invited_at) parts.push(`Invited ${when(i.invited_at)}${i.invited_by ? ` by ${i.invited_by}` : ""}`);
  else if (i.invited_by) parts.push(`Invited by ${i.invited_by}`);
  const ended = i.ended_at ?? i.responded_at;
  switch (i.status) {
    case "invited":
      if (i.expires_at) parts.push(expiresText(i.expires_at, now));
      break;
    case "accepted":
      if (i.responded_at) parts.push(`accepted ${when(i.responded_at)}`);
      break;
    case "declined":
      if (i.responded_at) parts.push(`declined ${when(i.responded_at)}`);
      break;
    case "left":
      if (ended) parts.push(`left ${when(ended)}`);
      break;
    case "removed":
      if (ended) parts.push(`removed ${when(ended)}`);
      break;
    case "cancelled":
      if (ended) parts.push(`cancelled ${when(ended)}`);
      break;
    case "expired":
      if (ended) parts.push(`expired ${when(ended)}`);
      else if (i.expires_at) parts.push(`expired ${when(i.expires_at)}`);
      break;
  }
  return parts.join(" · ");
}

/** "expires in 12 days", "expires in 5 hours", "expires today". */
export function expiresText(iso: string, now: Date): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const hours = Math.round((t - now.getTime()) / 3_600_000);
  if (hours <= 0) return "expires now";
  if (hours < 24) return `expires in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.round(hours / 24);
  return `expires in ${days} ${days === 1 ? "day" : "days"}`;
}

/** Slots as the panel says them: "3 of 5 places left". */
export function slotsText(slotsLeft: number, limit: number): string {
  const left = Math.max(0, slotsLeft);
  if (left === 0) return `All ${limit} places taken`;
  return `${left} of ${limit} ${limit === 1 ? "place" : "places"} left`;
}

/** The live invites first (co-hosting, then invited), then the rest: the order the server sends, kept if it ever does not. */
export function orderInvites<T extends { status: CohostStatus }>(items: readonly T[]): { live: T[]; past: T[] } {
  const live = items.filter((i) => isLiveCohost(i.status));
  live.sort((a, b) => (a.status === b.status ? 0 : a.status === "accepted" ? -1 : 1));
  return { live, past: items.filter((i) => !isLiveCohost(i.status)) };
}
