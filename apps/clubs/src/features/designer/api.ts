import { api } from "@moa/app-kit";
import { GATEWAY_PREFIX } from "@moa/auth";
import type { LayoutV2, PageSpec, TicketCanvas, TicketLayer } from "@moa/layout";

import { z } from "zod";

import {
  boardDesignSchema,
  layerDesignSchema,
  posterBoardSchema,
  posterVariantsSchema,
  type PosterSlot,
  starterSchema,
  uploadedImageSchema,
  type Audience,
  type BoardKind,
  type DesignKind,
  type DesignScope,
  type PresetChoice,
  storedDesignSchema,
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

/**
 * Drop this event's copy so it follows the club default again; or the club's, so events follow the system's.
 * A poster: drop this variant's layout for the format, so it follows the chain again.
 */
export async function resetDesign(scope: DesignScope, kind: DesignKind, audience: Audience, poster?: PosterSlot) {
  if (poster) {
    await api.del<unknown>(`${base(scope, kind)}/layout`, undefined, { query: posterQuery(poster) });
    return;
  }
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
 * POSTs JSON through the gateway and answers the PNG. Not the shared
 * client, which parses JSON: this response is an image. Same prefix and
 * cookie as every other call, so it is authenticated the same way.
 */
async function postForImage(path: string, body: unknown): Promise<Blob> {
  const response = await fetch(`${GATEWAY_PREFIX}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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

/** The unsaved design through the real renderer, as a PNG -- for the sample guest or a real registration. */
export const previewLayout = (scope: DesignScope, kind: DesignKind, audience: Audience, body: LayoutBody, ticketId: string | null): Promise<Blob> =>
  postForImage(`${base(scope, kind)}/layout/preview?audience=${audience}`, { ...body, ticket_id: ticketId });

// ─── Ready designs ──────────────────────────────────────────────────────

const presetBase = (scope: DesignScope, kind: DesignKind) => `${base(scope, kind)}/preset`;

/** Exactly what is saved: the design, its options, its bindings and its accent -- nothing of the editor's own. */
const presetBody = (choice: PresetChoice) => ({ id: choice.id, options: choice.options, bindings: choice.bindings, accent: choice.accent ?? null });

/** Choose a ready design for this audience and save its settings; it is in use from now on. Answers the design as GET does. */
export async function savePreset(scope: DesignScope, kind: DesignKind, audience: Audience, choice: PresetChoice) {
  const raw = await api.put<unknown>(presetBase(scope, kind), presetBody(choice), { query: { audience } });
  return layerDesignSchema.parse(raw);
}

/** Drop the ready design saved here: the design falls back to what it follows (the club's, or the built-in default). */
export async function resetPreset(scope: DesignScope, kind: DesignKind, audience: Audience) {
  await api.del<unknown>(presetBase(scope, kind), undefined, { query: { audience } });
}

const previewHtmlSchema = z.object({ html: z.string() });

/**
 * The unsaved settings filled in by the server, as one HTML page for a
 * sandboxed frame: the sample guest, or a registration by its ticket.
 */
export async function previewPresetHtml(
  scope: DesignScope,
  kind: DesignKind,
  audience: Audience,
  choice: PresetChoice,
  ticketId: string | null,
  signal?: AbortSignal
) {
  const raw = await api.post<unknown>(`${presetBase(scope, kind)}/preview`, { ...presetBody(choice), ticket_id: ticketId }, { query: { audience }, signal });
  return previewHtmlSchema.parse(raw).html;
}

/** The same settings rendered exactly as issued, as a PNG. */
export const previewPresetPng = (scope: DesignScope, kind: DesignKind, audience: Audience, choice: PresetChoice, ticketId: string | null): Promise<Blob> =>
  postForImage(`${presetBase(scope, kind)}/preview?format=png&audience=${audience}`, { ...presetBody(choice), ticket_id: ticketId });

// ─── A certificate's pictures ───────────────────────────────────────────

/** The pictures a certificate design prints: its logo and two signatures, as the stored design names them. */
export const ARTWORK_FIELDS = ["logo", "signature_1", "signature_2"] as const;
export type ArtworkField = (typeof ARTWORK_FIELDS)[number];
export type Artwork = Record<ArtworkField, string | null>;

const artworkOf = (config: Record<string, unknown>): Artwork =>
  Object.fromEntries(ARTWORK_FIELDS.map((f) => [f, typeof config[`${f}_url`] === "string" && config[`${f}_url`] ? (config[`${f}_url`] as string) : null])) as Artwork;

/** The event's certificate pictures for this audience, as the design in use holds them (links last an hour). */
export async function fetchArtwork(eventId: number, kind: DesignKind, audience: Audience): Promise<Artwork> {
  const raw = await api.get<unknown>(`/api/v1/events/${eventId}/designs/${kind}`, { query: { audience } });
  return artworkOf(storedDesignSchema.parse(raw).config);
}

/**
 * Upload one picture, or remove it with `null`. Saved at once, on the
 * event's own copy of the design (made first if the event followed the
 * club's), so it reaches the documents without pressing save.
 */
export async function saveArtwork(eventId: number, kind: DesignKind, audience: Audience, field: ArtworkField, file: File | null): Promise<Artwork> {
  const fd = new FormData();
  if (file) fd.append(field, file);
  else fd.append(`remove_${field}`, "true");
  const raw = await api.put<unknown>(`/api/v1/events/${eventId}/designs/${kind}/artwork`, fd, { query: { audience } });
  return artworkOf(storedDesignSchema.parse(raw).config);
}

// ─── Layout v2: the board ───────────────────────────────────────────────

/** Which poster layout a call is about: its variant and format. */
const posterQuery = (p: Pick<PosterSlot, "variant" | "format">) => ({ variant: p.variant, format: p.format });

/** The design as the board edits it: v2, converted on the server when it was saved as v1 or as a preset. A poster: one variant's layout for one format. */
export async function fetchBoard(scope: DesignScope, kind: BoardKind, audience: Audience, poster?: PosterSlot) {
  if (poster) return posterBoardSchema.parse(await api.get<unknown>(`${base(scope, kind)}/layout`, { query: posterQuery(poster) }));
  const raw = await api.get<unknown>(`${base(scope, kind)}/layout`, { query: { audience } });
  return boardDesignSchema.parse(raw);
}

/** A starter's layout, copied for this design (copy-on-use): nothing is saved until the board saves. A poster's: the one for the format. */
export async function fetchStarterLayout(scope: DesignScope, kind: BoardKind, id: string, format?: string): Promise<unknown> {
  // Ids may hold a slash ("ticket/03-daylight-boarding-pass"): each part is encoded, the slash kept.
  const path = id.split("/").map(encodeURIComponent).join("/");
  const raw = await api.post<unknown>(`${base(scope, kind)}/layout/starters/${path}`, {}, format ? { query: { format } } : undefined);
  return raw && typeof raw === "object" && "layout" in raw ? (raw as { layout: unknown }).layout : raw;
}

/** A poster starter's layouts, every format (copy-on-use: nothing is saved), for its picture in the gallery. */
export async function fetchPosterStarterFormats(eventId: number, id: string): Promise<Record<string, unknown>> {
  const path = id.split("/").map(encodeURIComponent).join("/");
  const raw = await api.post<unknown>(`/api/v1/events/${eventId}/designs/poster/layout/starters/${path}`, {}, { query: { format: "square" } });
  const o = raw && typeof raw === "object" ? (raw as { layout?: unknown; formats?: unknown }) : {};
  if (o.formats && typeof o.formats === "object") return o.formats as Record<string, unknown>;
  return o.layout ? { square: o.layout } : {};
}

/** Save the board's design: v2, which clears any preset saved before. Forks the design onto the event on first save. A poster: the variant's layout for the format. */
export async function saveBoard(scope: DesignScope, kind: BoardKind, audience: Audience, layout: LayoutV2, poster?: PosterSlot) {
  if (poster) return posterBoardSchema.parse(await api.put<unknown>(`${base(scope, kind)}/layout`, layout, { query: posterQuery(poster) }));
  const raw = await api.put<unknown>(`${base(scope, kind)}/layout`, layout, { query: { audience } });
  return boardDesignSchema.parse(raw);
}

/** The unsaved design drawn exactly as issued, as a PNG: for the sample guest, or a registration by its ticket. */
export const previewBoard = (scope: DesignScope, kind: BoardKind, audience: Audience, layout: LayoutV2, ticketId: string | null, poster?: PosterSlot): Promise<Blob> =>
  poster
    ? postForImage(`${base(scope, kind)}/layout/preview?${new URLSearchParams({ ...posterQuery(poster), as: "png" }).toString()}`, { layout, ticket_id: ticketId })
    : postForImage(`${base(scope, kind)}/layout/preview?format=png&audience=${audience}`, { layout, ticket_id: ticketId });

// ─── Posters: the variants (feature-register/posters/CONTRACT.md §10.3) ──

const posterBase = (eventId: number) => `/api/v1/events/${eventId}/designs/poster`;

/** The variants with a layout saved, and every variant one could be made for. Null from an API without posters. */
export async function fetchPosterVariants(eventId: number) {
  return posterVariantsSchema.parse(await api.get<unknown>(`${posterBase(eventId)}/variants`));
}

/** Drop a whole variant (every format), so its guests get the next design in the chain. */
export async function deletePosterVariant(eventId: number, variant: string) {
  return posterVariantsSchema.parse(await api.del<unknown>(`${posterBase(eventId)}/layout`, undefined, { query: { variant } }));
}

/** Save a starter's three layouts as this variant's design, at once. */
export async function applyPosterStarter(eventId: number, variant: string, starterId: string) {
  return posterVariantsSchema.parse(await api.post<unknown>(`${posterBase(eventId)}/apply`, { starter_id: starterId, variant }));
}
