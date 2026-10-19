import { api } from "@moa/app-kit";

import { clubStoreItemSchema, clubStoreSchema, offersSchema, photoUploadSchema } from "./schemas";

const BASE = "/api/v1/clubs/store";

/** Every item the club has made, with where it is offered and what it sold across them. */
export async function fetchClubStore() {
  return clubStoreSchema.parse(await api.get<unknown>(BASE)).items;
}

export async function createClubItem(body: Record<string, unknown>) {
  return clubStoreItemSchema.parse(await api.post<unknown>(BASE, body));
}

export async function updateClubItem(id: string, patch: Record<string, unknown>) {
  return clubStoreItemSchema.parse(await api.patch<unknown>(`${BASE}/${id}`, patch));
}

export async function deleteClubItem(id: string) {
  await api.del<unknown>(`${BASE}/${id}`);
}

/** A photo for an item: PNG, JPEG or WebP, up to 5 MB. The key goes on the item. */
export async function uploadClubItemPhoto(file: File) {
  const fd = new FormData();
  fd.append("file", file);
  return photoUploadSchema.parse(await api.post<unknown>(`${BASE}/photo`, fd));
}

const offersPath = (eventId: number) => `/api/v1/events/${eventId}/store/offers`;

/** Which of the club's items an event offers, in order. */
export async function fetchEventOffers(eventId: number) {
  return offersSchema.parse(await api.get<unknown>(offersPath(eventId)));
}

/** Replaces what an event offers; the order given is the order its registration page shows. */
export async function setEventOffers(eventId: number, itemIds: string[]) {
  return offersSchema.parse(await api.put<unknown>(offersPath(eventId), { item_ids: itemIds }));
}
