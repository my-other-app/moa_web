import { api } from "@moa/app-kit";

import { adoptionSchema, firebaseStatusSchema, sendResultSchema, tokenCountSchema, type PushInput } from "./schemas";

export async function fetchDeviceCount() {
  return tokenCountSchema.parse(await api.get<unknown>("/api/v1/notifications/test/tokens")).count;
}

export async function fetchAdoption() {
  return adoptionSchema.parse(await api.get<unknown>("/api/v1/notifications/topics/adoption"));
}

export async function fetchFirebaseStatus() {
  return firebaseStatusSchema.parse(await api.get<unknown>("/api/v1/notifications/test/firebase-status"));
}

/** Every device on the platform. Owners only, twice an hour (the server's limit). */
export async function sendToEveryone(input: PushInput) {
  const body = { title: input.title, body: input.body, ...(input.image_url ? { image_url: input.image_url } : {}) };
  return sendResultSchema.parse(await api.post<unknown>("/api/v1/notifications/test/send-all", body));
}
