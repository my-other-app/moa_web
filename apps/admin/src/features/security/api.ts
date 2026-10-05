import { api } from "@moa/app-kit";
import { z } from "zod";

import {
  sessionSchema,
  totpEnableSchema,
  totpSetupSchema,
  totpStatusSchema,
} from "./schemas";

export async function fetchTotpStatus() {
  return totpStatusSchema.parse(await api.get<unknown>("/api/v1/auth/2fa"));
}

export async function startTotpSetup() {
  return totpSetupSchema.parse(await api.post<unknown>("/api/v1/auth/2fa/setup"));
}

export async function enableTotp(code: string) {
  return totpEnableSchema.parse(
    await api.post<unknown>("/api/v1/auth/2fa/enable", { code })
  );
}

export async function disableTotp(code: string): Promise<void> {
  await api.post<void>("/api/v1/auth/2fa/disable", { code });
}

export async function fetchSessions() {
  return z.array(sessionSchema).parse(await api.get<unknown>("/api/v1/auth/sessions"));
}

export async function revokeSession(sessionId: string): Promise<void> {
  await api.del<void>(`/api/v1/auth/sessions/${sessionId}`);
}

/** Ends every session including this one, so the caller must sign out after. */
export async function revokeAllSessions(): Promise<void> {
  await api.del<void>("/api/v1/auth/sessions");
}
