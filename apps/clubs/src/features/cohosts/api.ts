import { api, cohostInviteSchema, cohostListingSchema } from "@moa/app-kit";

import { clubPicksSchema, invitationSchema, invitationsSchema } from "./schemas";

/** /api/v1/events/{id}/cohosts: the host's side of one event (contract §3). */
const eventBase = (eventId: number) => `/api/v1/events/${eventId}/cohosts`;
/** /api/v1/clubs/cohosts/invitations: the signed-in club's own invitations (contract §4). */
const INVITATIONS = "/api/v1/clubs/cohosts/invitations";

export async function fetchCohosts(eventId: number) {
  return cohostListingSchema.parse(await api.get<unknown>(eventBase(eventId)));
}

/** Verified, live clubs whose name or handle holds `q` (two characters at least), best first. */
export async function searchCohostClubs(eventId: number, q: string) {
  return clubPicksSchema.parse(await api.get<unknown>(`${eventBase(eventId)}/search`, { query: { q } })).items;
}

export async function inviteCohost(eventId: number, body: { club_id: number; note?: string | undefined }) {
  const sent: { club_id: number; note?: string } = { club_id: body.club_id };
  if (body.note && body.note.trim()) sent.note = body.note.trim();
  return cohostInviteSchema.parse(await api.post<unknown>(eventBase(eventId), sent));
}

/** A pending invite becomes `cancelled`; a co-host becomes `removed`. */
export async function endCohost(eventId: number, inviteId: number) {
  return cohostInviteSchema.parse(await api.del<unknown>(`${eventBase(eventId)}/${inviteId}`));
}

/** The co-host's own way out: its invite becomes `left`, and its team loses the event. */
export async function leaveCohostedEvent(eventId: number) {
  return cohostInviteSchema.parse(await api.post<unknown>(`${eventBase(eventId)}/leave`, {}));
}

export type InvitationFilter = "pending" | "all";

export async function fetchInvitations(status: InvitationFilter) {
  return invitationsSchema.parse(await api.get<unknown>(INVITATIONS, { query: { status } }));
}

export async function answerInvitation(inviteId: number, answer: "accept" | "decline") {
  return invitationSchema.parse(await api.post<unknown>(`${INVITATIONS}/${inviteId}/${answer}`, {}));
}
