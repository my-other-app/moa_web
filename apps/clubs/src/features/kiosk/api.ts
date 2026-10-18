import { api } from "@moa/app-kit";
import { ApiError, createApiClient } from "@moa/api";
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

/** Five wrong PINs in fifteen minutes lock staff mode on a kiosk (429, error_code PIN_LOCKED). */
export const PIN_LOCKED = "PIN_LOCKED";
export const PIN_LOCKED_MESSAGE = "Too many tries, wait 15 minutes.";

/** Why staff mode did not open, in the words the PIN dialog shows. */
export function staffProblem(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.errorCode === PIN_LOCKED || error.status === 429) return PIN_LOCKED_MESSAGE;
    if (error.status === 403) return "That PIN does not open staff mode on this kiosk.";
  }
  return error instanceof Error && error.message ? error.message : "Staff mode did not open. Try again.";
}
export async function fetchSelfQr(token: string) {
  return selfQrSchema.parse(await kioskClient(token).get<unknown>("/api/v1/kiosk/self-qr"));
}
export async function markSelfPrinted(token: string, session: string) {
  await kioskClient(token).post<unknown>("/api/v1/kiosk/self-printed", { session });
}
/**
 * A card for a guest the kiosk just admitted, or one a phone asked to print
 * here: through the gateway, for PrintFrame to fetch with the device token
 * in its header (`kioskHeaders`). Never with the token in the link -- in the
 * query string it lands in every access log on the way. (The API still reads
 * `?token=` for kiosks deployed before this, deprecated.)
 */
export const kioskCardUrl = (printUrl: string) => `${GATEWAY_PREFIX}${printUrl}`;
export const kioskSelfCardUrl = (session: string) => `${GATEWAY_PREFIX}/api/v1/kiosk/self-card.pdf?session=${encodeURIComponent(session)}`;
export const kioskHeaders = (token: string): Record<string, string> => ({ [KIOSK_TOKEN_HEADER]: token });

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

/** The shortest staff PIN the API keeps; a shorter one is a 422. */
export const PIN_MIN = 4;

/** What is wrong with a PIN before it is sent, or null. An empty one is "no PIN" and is fine. */
export function pinProblem(pin: string): string | null {
  const n = pin.trim().length;
  return n > 0 && n < PIN_MIN ? `A PIN of ${PIN_MIN} digits or more.` : null;
}

/** The API's word on a refused PIN: 422 with errors.fields.kiosk_pin. */
export function pinFieldError(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.status !== 422) return null;
  const errors = (error.fieldErrors ?? {}) as Record<string, unknown>;
  const fields = errors.fields && typeof errors.fields === "object" ? (errors.fields as Record<string, unknown>) : errors;
  const said = fields.kiosk_pin;
  if (typeof said === "string") return said;
  if (Array.isArray(said) && typeof said[0] === "string") return said[0];
  return null;
}
