import { api } from "@moa/app-kit";

import { securityOverviewSchema, twoFactorEnabledSchema, twoFactorSetupSchema } from "./schemas";

export async function fetchSecurity() {
  const raw = await api.get<unknown>("/api/v1/auth/security/overview");
  return securityOverviewSchema.parse(raw);
}

export async function revokeSession(id: string) {
  await api.del<unknown>(`/api/v1/auth/sessions/${id}`);
}

export async function signOutOthers(): Promise<number> {
  const raw = await api.post<{ signed_out: number }>("/api/v1/auth/security/sign-out-others", {});
  return raw.signed_out;
}

export async function setNotifyNewDevice(on: boolean) {
  await api.patch<unknown>("/api/v1/auth/security/preferences", { notify_new_device: on });
}

export async function startTwoFactor() {
  return twoFactorSetupSchema.parse(await api.post<unknown>("/api/v1/auth/2fa/setup", {}));
}

export async function enableTwoFactor(code: string) {
  return twoFactorEnabledSchema.parse(await api.post<unknown>("/api/v1/auth/2fa/enable", { code }));
}

export async function disableTwoFactor(code: string) {
  await api.post<unknown>("/api/v1/auth/2fa/disable", { code });
}

/** A fresh set of recovery codes, for a current authenticator code; every earlier one stops working. */
export async function renewRecoveryCodes(code: string) {
  return twoFactorEnabledSchema.parse(await api.post<unknown>("/api/v1/auth/2fa/recovery-codes", { code }));
}
