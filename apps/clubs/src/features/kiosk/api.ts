import { api } from "@moa/app-kit";
import { createApiClient } from "@moa/api";
import { GATEWAY_PREFIX } from "@moa/auth";

import { kioskContextSchema, kioskDeviceSchema, kioskSettingsSchema, pairedKioskSchema, redeemResultSchema, selfQrSchema, staffSchema, type KioskSettings } from "./schemas";
import { z } from "zod";

export const KIOSK_TOKEN_HEADER = "X-Kiosk-Token";
export const KIOSK_TOKEN_STORAGE = "moa.kiosk.token";

const clients = new Map<string, ReturnType<typeof createApiClient>>();
/** The kiosk's own client: the device token on every call, no account. */
export const kioskClient = (token: string) => {
  let c = clients.get(token);
  if (!c) {
    c = createApiClient({ baseUrl: GATEWAY_PREFIX, getHeaders: (): Record<string, string> => ({ [KIOSK_TOKEN_HEADER]: token }) });
    clients.set(token, c);
  }
  return c;
};

export async function fetchKioskContext(token: string) {
  return kioskContextSchema.parse(await kioskClient(token).get<unknown>("/api/v1/kiosk/context"));
}
export async function redeemAtKiosk(token: string, code: string, clientRef: string) {
  return redeemResultSchema.parse(await kioskClient(token).post<unknown>("/api/v1/kiosk/redeem", { code, client_ref: clientRef }));
}
export async function notMe(token: string, redemption: string) {
  await kioskClient(token).post<unknown>("/api/v1/kiosk/not-me", { token: redemption });
}
export async function kioskStaff(token: string, pin: string) {
  return staffSchema.parse(await kioskClient(token).post<unknown>("/api/v1/kiosk/staff", { pin }));
}
export async function fetchSelfQr(token: string) {
  return selfQrSchema.parse(await kioskClient(token).get<unknown>("/api/v1/kiosk/self-qr"));
}
export async function markSelfPrinted(token: string, session: string) {
  await kioskClient(token).post<unknown>("/api/v1/kiosk/self-printed", { session });
}
/** A card for a guest the kiosk just admitted, or one a phone asked to print here: links a frame can load. */
export const kioskCardUrl = (token: string, printUrl: string) => `${GATEWAY_PREFIX}${printUrl}&token=${encodeURIComponent(token)}`;
export const kioskSelfCardUrl = (token: string, session: string) => `${GATEWAY_PREFIX}/api/v1/kiosk/self-card.pdf?session=${encodeURIComponent(session)}&token=${encodeURIComponent(token)}`;

// --- the dashboard's side -----------------------------------------------------------

const base = (eventId: number) => `/api/v1/events/${eventId}/kiosks`;
export async function fetchKiosks(eventId: number) {
  return z.array(kioskDeviceSchema).parse(await api.get<unknown>(base(eventId)));
}
export async function pairKiosk(eventId: number, body: { name: string; door_id?: string | null; door_label?: string | null; shift_hours?: number }) {
  return pairedKioskSchema.parse(await api.post<unknown>(base(eventId), body));
}
export async function rotateKiosk(eventId: number, deviceId: string, shiftHours = 12) {
  return pairedKioskSchema.parse(await api.post<unknown>(`${base(eventId)}/${deviceId}/rotate`, { shift_hours: shiftHours }));
}
export async function unpairKiosk(eventId: number, deviceId: string) {
  return kioskDeviceSchema.parse(await api.del<unknown>(`${base(eventId)}/${deviceId}`));
}
export async function fetchKioskSettings(eventId: number) {
  return kioskSettingsSchema.parse(await api.get<unknown>(`${base(eventId)}/settings`));
}
export async function updateKioskSettings(eventId: number, body: Partial<KioskSettings> & { kiosk_pin?: string | null }) {
  return kioskSettingsSchema.parse(await api.patch<unknown>(`${base(eventId)}/settings`, body));
}
