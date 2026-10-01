import { createApiClient } from "@moa/api";
import { GATEWAY_PREFIX } from "@moa/auth";

/**
 * Browser-side API client.
 *
 * Every call goes to this app's own origin under /api/gateway, which the BFF
 * route handler forwards upstream. Client code therefore never knows the API
 * origin, never triggers CORS, and the auth cookie is always first-party.
 */
export const api = createApiClient({
  baseUrl: GATEWAY_PREFIX,
});
