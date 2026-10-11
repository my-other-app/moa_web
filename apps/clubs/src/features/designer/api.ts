import { api } from "@moa/app-kit";
import { GATEWAY_PREFIX } from "@moa/auth";
import type { PageSpec, TicketCanvas, TicketLayer } from "@moa/layout";

import {
  layerDesignSchema,
  starterSchema,
  uploadedImageSchema,
  type Audience,
  type DesignKind,
  type DesignScope,
} from "./schemas";

const base = (scope: DesignScope, kind: DesignKind) =>
  scope.kind === "event" ? `/api/v1/events/${scope.eventId}/designs/${kind}` : `/api/v1/clubs/designs/${kind}`;

export type LayoutBody = { canvas: TicketCanvas; layers: TicketLayer[]; page: PageSpec };

export async function fetchLayout(scope: DesignScope, kind: DesignKind, audience: Audience) {
  const raw = await api.get<unknown>(`${base(scope, kind)}/layout`, { query: { audience } });
  return layerDesignSchema.parse(raw);
}

export async function fetchStarter(scope: DesignScope, kind: DesignKind, name: string) {
  const raw = await api.get<unknown>(`${base(scope, kind)}/layout/starters/${encodeURIComponent(name)}`);
  return starterSchema.parse(raw);
}

/** Forks the design onto the event on first save and bumps its version. */
export async function saveLayout(scope: DesignScope, kind: DesignKind, audience: Audience, body: LayoutBody) {
  const raw = await api.put<unknown>(`${base(scope, kind)}/layout`, body, { query: { audience } });
  return layerDesignSchema.parse(raw);
}

/** Drop this event's copy so it follows the club default again; or the club's, so events follow the system's. */
export async function resetDesign(scope: DesignScope, kind: DesignKind, audience: Audience) {
  const path = scope.kind === "event" ? base(scope, kind) : `${base(scope, kind)}/layout`;
  await api.del<unknown>(path, undefined, { query: { audience } });
}

/**
 * A template or a picture for an image layer. Stored under the event, so the
 * key it comes back with is the one the layout saves; the URL is for showing
 * it now and may expire.
 */
export async function uploadLayoutImage(
  scope: DesignScope,
  kind: DesignKind,
  file: File,
  purpose: "template" | "image"
) {
  const fd = new FormData();
  fd.append("file", file);
  const raw = await api.post<unknown>(`${base(scope, kind)}/layout/images`, fd, { query: { purpose } });
  return uploadedImageSchema.parse(raw);
}

/**
 * The unsaved design through the real renderer, as a PNG -- for the sample
 * guest or a real registration.
 *
 * Goes through the gateway directly rather than the shared client, which
 * parses JSON: this response is an image. Same prefix and cookie as every
 * other call, so it is authenticated the same way.
 */
export async function previewLayout(
  scope: DesignScope,
  kind: DesignKind,
  audience: Audience,
  body: LayoutBody,
  ticketId: string | null
): Promise<Blob> {
  const response = await fetch(`${GATEWAY_PREFIX}${base(scope, kind)}/layout/preview?audience=${audience}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, ticket_id: ticketId }),
  });
  if (!response.ok) {
    let message = `Preview failed (${response.status})`;
    try {
      const data = (await response.json()) as { message?: string; detail?: string };
      message = data.message ?? data.detail ?? message;
    } catch {
      // Not JSON; the status is the best we have.
    }
    throw new Error(message);
  }
  return response.blob();
}
