import { createApiClient } from "@moa/api";
import { GATEWAY_PREFIX } from "@moa/auth";

import { SESSION_RENEWAL } from "./auth/session-end";

/**
 * Browser-side API client.
 *
 * Every call goes to this app's own origin under /api/gateway, which the BFF
 * route handler forwards upstream. Client code therefore never knows the API
 * origin, never triggers CORS, and the auth cookie is always first-party.
 *
 * A session that runs out under an open page is renewed by itself and the
 * request sent again (SESSION_RENEWAL; packages/api/src/client.ts).
 */
export const api = createApiClient({
  baseUrl: GATEWAY_PREFIX,
  renew: SESSION_RENEWAL,
});
