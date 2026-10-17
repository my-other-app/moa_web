import { api } from "@moa/app-kit";

import { gatewaySchema, type GatewayKeys } from "./schemas";

const BASE = "/api/v1/clubs/payments/gateway";

/** The club's own Razorpay, connected or not. Team members may read it. */
export async function fetchGateway() {
  return gatewaySchema.parse(await api.get<unknown>(BASE));
}

/**
 * PUT: the server checks the keys with Razorpay before it keeps them, and
 * refuses with 422 INVALID_KEYS (Razorpay's reason in the message) or
 * TEST_KEYS_NOT_ALLOWED. The secret is never sent back.
 */
export async function saveGateway(keys: GatewayKeys) {
  return gatewaySchema.parse(await api.put<unknown>(BASE, { key_id: keys.key_id.trim(), key_secret: keys.key_secret.trim() }));
}

/** POST /verify: checks the keys again, and whether Razorpay's notices have reached us. */
export async function verifyGateway() {
  return gatewaySchema.parse(await api.post<unknown>(`${BASE}/verify`));
}

/** DELETE: new payments go to MyOtherApp's account again. */
export async function disconnectGateway() {
  return gatewaySchema.parse(await api.del<unknown>(BASE));
}
