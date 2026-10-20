import { api } from "@moa/app-kit";

import { connectedAppsSchema, pendingActionSchema } from "./schemas";

/**
 * docs/MCP.md, section 7, through the gateway:
 *
 *   GET    /clubs/pending-actions/{token}           what an assistant asked for
 *   POST   /clubs/pending-actions/{token}/confirm   approve it (no body); the same shape back
 *   POST   /clubs/pending-actions/{token}/reject    turn it down (no body); the same shape back
 *   GET    /clubs/connected-apps                    {can_manage_all, apps}
 *   DELETE /clubs/connected-apps/{id}               disconnect: every token ends, waiting requests are turned down
 */
const action = (token: string) => `/api/v1/clubs/pending-actions/${encodeURIComponent(token)}`;

export async function fetchPendingAction(token: string) {
  return pendingActionSchema.parse(await api.get<unknown>(action(token)));
}

export async function decidePendingAction(token: string, decision: "confirm" | "reject") {
  return pendingActionSchema.parse(await api.post<unknown>(`${action(token)}/${decision}`));
}

export async function fetchConnectedApps() {
  return connectedAppsSchema.parse(await api.get<unknown>("/api/v1/clubs/connected-apps"));
}

export async function disconnectApp(id: string) {
  await api.del<unknown>(`/api/v1/clubs/connected-apps/${encodeURIComponent(id)}`);
}
