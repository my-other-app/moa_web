import { api } from "@moa/app-kit";

import { eventPartnerListSchema, eventPartnerSchema, fromClubResultSchema, type EventPartner, type PartnerForm, type PartnerKind } from "./schemas";

/** /api/v1/events/{id}/partners: one request per change, as the club profile's partners. */
const base = (eventId: number) => `/api/v1/events/${eventId}/partners`;

const body = (form: PartnerForm) => ({ name: form.name, label: form.label || null, link: form.link || null });

export async function fetchEventPartners(eventId: number): Promise<EventPartner[]> {
  return eventPartnerListSchema.parse(await api.get<unknown>(base(eventId)));
}

export async function createEventPartner(eventId: number, kind: PartnerKind, form: PartnerForm): Promise<EventPartner> {
  return eventPartnerSchema.parse(await api.post<unknown>(base(eventId), { kind, ...body(form) }));
}

export async function updateEventPartner(eventId: number, id: number, patch: Partial<PartnerForm> & { kind?: PartnerKind }): Promise<EventPartner> {
  const sent: Record<string, unknown> = {};
  if (patch.kind !== undefined) sent.kind = patch.kind;
  if (patch.name !== undefined) sent.name = patch.name;
  if (patch.label !== undefined) sent.label = patch.label || null;
  if (patch.link !== undefined) sent.link = patch.link || null;
  return eventPartnerSchema.parse(await api.patch<unknown>(`${base(eventId)}/${id}`, sent));
}

export async function uploadEventPartnerLogo(eventId: number, id: number, file: File): Promise<EventPartner> {
  const form = new FormData();
  form.append("logo", file);
  return eventPartnerSchema.parse(await api.put<unknown>(`${base(eventId)}/${id}/logo`, form));
}

export async function deleteEventPartner(eventId: number, id: number): Promise<void> {
  await api.del<unknown>(`${base(eventId)}/${id}`);
}

/** Every live row of `kind`, in the new order; answers the whole list. */
export async function orderEventPartners(eventId: number, kind: PartnerKind, ids: number[]): Promise<EventPartner[]> {
  return eventPartnerListSchema.parse(await api.put<unknown>(`${base(eventId)}/order`, { kind, ids }));
}

/** Copies the club's partners (name, logo, role as the label); one already on the event comes back in `skipped`. */
export async function addFromClubPartners(eventId: number, kind: PartnerKind, clubPartnerIds: number[]) {
  return fromClubResultSchema.parse(await api.post<unknown>(`${base(eventId)}/from-club`, { kind, club_partner_ids: clubPartnerIds }));
}
