import { GATEWAY_PREFIX } from "@moa/auth";

import { kioskClient, kioskHeaders } from "@/features/kiosk/api";

import { claimResponseSchema } from "./schemas";

export const STATION_TOKEN_STORAGE = "moa.printstation.token";
export const stationHeaders = kioskHeaders;

/** The heartbeat and the work in one call: an empty answer means nothing is waiting. */
export async function claimNext(token: string) {
  return claimResponseSchema.parse(await kioskClient(token).post<unknown>("/api/v1/kiosk/printer/claim", {}));
}

/** Tells the server how the card went. `error` is plain words for staff (the server keeps 400 characters). */
export async function reportDone(token: string, id: string, ok: boolean, error: string | null) {
  await kioskClient(token).post<unknown>(`/api/v1/kiosk/printer/requests/${encodeURIComponent(id)}/done`, { ok, error: ok ? null : error });
}

/**
 * A claimed card, through the gateway, for PrintFrame to fetch with the token in a header.
 * The server names it relative to the API root without /api/v1 (`/kiosk/printer/requests/{id}/card.pdf`);
 * one that already carries the prefix is left as it is.
 */
export const stationCardUrl = (cardUrl: string) => `${GATEWAY_PREFIX}${cardUrl.startsWith("/api/") ? "" : "/api/v1"}${cardUrl}`;
/** The one-page sample card (a POST); nothing is recorded. */
export const TEST_CARD_URL = `${GATEWAY_PREFIX}/api/v1/kiosk/printer/test`;
