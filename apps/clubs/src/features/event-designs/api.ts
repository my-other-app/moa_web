import { api } from "@moa/app-kit";

import { designResponseSchema, type Audience, type DesignKind } from "./schemas";

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
