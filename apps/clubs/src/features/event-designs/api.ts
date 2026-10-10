import { api } from "@moa/app-kit";
import { GATEWAY_PREFIX } from "@moa/auth";

import {
  designResponseSchema,
  designSampleSchema,
  type Audience,
  type DesignKind,
} from "./schemas";

const base = (eventId: number, kind: DesignKind) =>
  `/api/v1/events/${eventId}/designs/${kind}`;

export async function fetchDesign(
  eventId: number,
  kind: DesignKind,
  audience: Audience
) {
  const raw = await api.get<unknown>(
    `${base(eventId, kind)}?audience=${audience}`
  );
  return designResponseSchema.parse(raw);
}

export async function saveDesign(
  eventId: number,
  kind: DesignKind,
  audience: Audience,
  config: Record<string, unknown>,
  name?: string
) {
  const raw = await api.put<unknown>(`${base(eventId, kind)}?audience=${audience}`, {
    config,
    ...(name ? { name } : {}),
  });
  return designResponseSchema.parse(raw);
}

/** Drop this event's copy so it follows the club default again. */
export async function resetDesign(
  eventId: number,
  kind: DesignKind,
  audience: Audience
) {
  const raw = await api.del<unknown>(`${base(eventId, kind)}?audience=${audience}`);
  return designResponseSchema.parse(raw);
}

/**
 * Artwork goes in its own request.
 *
 * The config is saved on every change; sending a multi-megabyte PNG with each
 * one would re-upload the artwork for a nudged layer. A field left out is left
 * alone server-side, so this only ever sends what the user actually picked.
 */
export async function saveArtwork(
  eventId: number,
  kind: DesignKind,
  audience: Audience,
  files: Partial<Record<
    "logo" | "secondary_logo" | "background_image" | "signature_1" | "signature_2",
    File
  >>,
  removals: string[] = []
) {
  const fd = new FormData();
  for (const [field, file] of Object.entries(files)) {
    if (file) fd.append(field, file);
  }
  for (const field of removals) fd.append(`remove_${field}`, "true");

  const raw = await api.put<unknown>(
    `${base(eventId, kind)}/artwork?audience=${audience}`,
    fd
  );
  return designResponseSchema.parse(raw);
}


/**
 * A real attendee's values and QR, or a sample attendee's without a ticket.
 *
 * The canvas substitutes these as the organiser drags, so a long real name is
 * seen to fit -- or not -- before anyone is issued a document.
 */
export async function fetchDesignSample(
  eventId: number,
  kind: DesignKind,
  ticketId: string | null
) {
  const raw = await api.get<unknown>(
    `${base(eventId, kind)}/sample${ticketId ? `?ticket_id=${encodeURIComponent(ticketId)}` : ""}`
  );
  return designSampleSchema.parse(raw);
}

/**
 * The document rendered exactly, from the unsaved design, as a PNG.
 *
 * Goes through the gateway directly rather than the shared client, which
 * parses JSON: this response is an image. Same prefix and cookie as every
 * other call, so it is authenticated the same way.
 */
export async function renderDesignPreview(
  eventId: number,
  kind: DesignKind,
  audience: Audience,
  config: Record<string, unknown>,
  ticketId: string | null
): Promise<Blob> {
  const response = await fetch(
    `${GATEWAY_PREFIX}${base(eventId, kind)}/preview?audience=${audience}`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config, ticket_id: ticketId }),
    }
  );
  if (!response.ok) {
    let message = `Preview failed (${response.status})`;
    try {
      const body = (await response.json()) as { message?: string; detail?: string };
      message = body.message ?? body.detail ?? message;
    } catch {
      // Not JSON; the status is the best we have.
    }
    throw new Error(message);
  }
  return response.blob();
}
