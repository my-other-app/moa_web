import { z } from "zod";

/**
 * Layers: content placed on a club's own artwork.
 *
 * Coordinates are in the artwork's own pixels, never the displayed size, so
 * the editor and the PDF renderer agree regardless of zoom or screen. Every
 * conversion between the two lives in `toArtwork` below rather than being
 * repeated at each drag handler.
 */
export const LAYER_TYPES = ["text", "qr", "image", "shape"] as const;
export const OVERFLOW_MODES = ["shrink", "clip"] as const;

/**
 * Bounds and defaults mirror the backend's TemplateLayer. Where they drift,
 * the editor lets through a value the API rejects on save -- which surfaces
 * as a failed save after the work is done, rather than as a disabled input.
 */
export const layerSchema = z.object({
  id: z.string(),
  type: z.enum(LAYER_TYPES).default("text"),
  name: z.string().nullish(),
  text: z.string().default(""),
  x: z.number().int().min(0).default(0),
  y: z.number().int().min(0).default(0),
  width: z.number().int().min(1).nullish(),
  font_size: z.number().int().min(1).max(400).default(24),
  color: z.string().default("#ffffff"),
  align: z.enum(["left", "center", "right"]).default("left"),
  bold: z.boolean().default(false),
  max_lines: z.number().int().min(1).max(20).default(1),
  line_spacing: z.number().min(-20).max(200).default(0),

  /*
   * Everything below defaults to what the renderer already did, so a
   * template saved before the editor gained these controls opens unchanged.
   */

  // Unset means "use the template's font", so changing the template font
  // still moves every layer that never overrode it.
  font: z.string().nullish(),
  // `bold` above is kept for older configs; weight wins when both are set.
  weight: z.number().int().min(100).max(900).nullish(),
  letter_spacing: z.number().min(-20).max(100).default(0),
  opacity: z.number().int().min(0).max(100).default(100),
  height: z.number().int().min(1).nullish(),
  overflow: z.enum(OVERFLOW_MODES).default("shrink"),
  hidden: z.boolean().default(false),
  locked: z.boolean().default(false),
  image_url: z.string().nullish(),
  fill: z.string().nullish(),
  radius: z.number().int().min(0).max(400).default(0),
});

export const canvasSchema = z.object({
  width: z.number().int().min(0).default(0),
  height: z.number().int().min(0).default(0),
});

export type Layer = z.infer<typeof layerSchema>;
export type Canvas = z.infer<typeof canvasSchema>;

/** Tokens a layer may use, by template kind. Mirrors the backend's lists. */
export const TICKET_TOKENS = [
  { token: "name", label: "Attendee name", sample: "Lorem Ipsum" },
  { token: "ticket_code", label: "Ticket code", sample: "MOA-2048" },
  { token: "event_name", label: "Event name", sample: "Lorem Ipsum Event" },
  { token: "event_title", label: "Event title", sample: "Lorem Ipsum Event" },
  { token: "event_date", label: "Event date", sample: "20 Sep 2026" },
  { token: "event_time", label: "Event time", sample: "06:00 PM" },
  { token: "event_start_time", label: "Start time", sample: "06:00 PM" },
  { token: "event_end_time", label: "End time", sample: "09:00 PM" },
  { token: "venue", label: "Venue", sample: "Innovation Hall" },
  { token: "club_name", label: "Club name", sample: "Lorem Club" },
  { token: "team_name", label: "Team name", sample: "Lorem Team" },
] as const;

export const CERTIFICATE_TOKENS = [
  { token: "name", label: "Recipient name", sample: "Lorem Ipsum" },
  { token: "event_name", label: "Event name", sample: "Lorem Ipsum Event" },
  { token: "event_title", label: "Event title", sample: "Lorem Ipsum Event" },
  { token: "event_date", label: "Event date", sample: "20 Sep 2026" },
  { token: "club_name", label: "Club name", sample: "Lorem Club" },
  { token: "certificate_id", label: "Certificate ID", sample: "CERT-0042" },
  { token: "placing", label: "Placing", sample: "First" },
] as const;

export type TokenSpec = { token: string; label: string; sample: string };

/**
 * Replace `{{token}}` with its sample value.
 *
 * An unrecognised token is left visible, matching the renderer: a typo should
 * look wrong in the preview rather than silently disappearing, which is the
 * version that reaches attendees.
 */
export function withSampleValues(
  text: string,
  tokens: readonly TokenSpec[],
  values?: Record<string, string> | null
): string {
  let out = text;
  for (const spec of tokens) {
    // A real attendee's values when the designer has one; the placeholder
    // otherwise. A key the server did not send falls back rather than
    // printing as braces, so a new token still previews as something.
    const value = values && spec.token in values ? values[spec.token] ?? "" : spec.sample;
    out = out.split(`{{${spec.token}}}`).join(value);
  }
  return out;
}

/**
 * Screen delta to artwork pixels.
 *
 * The stage is drawn at `scale`, so a 10px drag at 50% zoom is 20 artwork
 * pixels. Getting this backwards makes layers drift away from the cursor the
 * further you zoom out, which is the bug this function exists to prevent.
 */
export function toArtwork(deltaPx: number, scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return 0;
  return deltaPx / scale;
}

/** Keep a layer inside the artwork, so it cannot be dragged out of view. */
export function clampToCanvas(
  layer: Pick<Layer, "x" | "y">,
  canvas: Canvas
): { x: number; y: number } {
  const maxX = Math.max(0, canvas.width - 1);
  const maxY = Math.max(0, canvas.height - 1);
  return {
    x: Math.round(Math.min(Math.max(0, layer.x), canvas.width ? maxX : layer.x)),
    y: Math.round(Math.min(Math.max(0, layer.y), canvas.height ? maxY : layer.y)),
  };
}

let counter = 0;

/** Every field at its schema default, so a new layer is always complete. */
function baseLayer(id: string, type: Layer["type"], x: number, y: number): Layer {
  return {
    id,
    type,
    name: null,
    text: "",
    x,
    y,
    width: null,
    font_size: 32,
    color: "#ffffff",
    align: "left",
    bold: false,
    max_lines: 1,
    line_spacing: 0,
    font: null,
    weight: null,
    letter_spacing: 0,
    opacity: 100,
    height: null,
    overflow: "shrink",
    hidden: false,
    locked: false,
    image_url: null,
    fill: null,
    radius: 0,
  };
}

export function newLayer(type: Layer["type"], canvas: Canvas): Layer {
  counter += 1;
  const id = `${type}-${Date.now().toString(36)}-${counter}`;
  // Dropped near the top-left rather than at 0,0 so a new layer is visibly
  // inside the artwork and not tucked under its corner radius.
  const x = Math.round((canvas.width || 800) * 0.1);
  const y = Math.round((canvas.height || 600) * 0.1);
  const layer = baseLayer(id, type, x, y);

  switch (type) {
    case "qr":
      // Square, so width is the whole size.
      return { ...layer, name: "QR code", width: 160 };
    case "image":
      return { ...layer, name: "Image", width: 240, height: 120 };
    case "shape":
      // Visible on its own from the moment it is added -- a transparent
      // rectangle looks like nothing happened.
      return { ...layer, name: "Shape", width: 240, height: 8, fill: "#1db9a0" };
    default:
      return { ...layer, text: "{{name}}" };
  }
}

/** What the layers list calls a layer. */
export function layerLabel(layer: Layer): string {
  if (layer.name) return layer.name;
  switch (layer.type) {
    case "qr":
      return "QR code";
    case "image":
      return "Image";
    case "shape":
      return "Shape";
    default:
      return layer.text.trim() || "Empty text";
  }
}

/** Human name for the layer type, used as the list subtitle. */
export function layerTypeLabel(type: Layer["type"]): string {
  switch (type) {
    case "qr":
      return "QR layer";
    case "image":
      return "Image layer";
    case "shape":
      return "Shape layer";
    default:
      return "Text layer";
  }
}

/**
 * The weight to render at, reconciling `weight` with the older `bold`.
 *
 * Mirrors the backend's `effective_weight`: a config may carry either, and
 * the preview has to agree with the PDF about which one wins.
 */
export function effectiveWeight(layer: Pick<Layer, "weight" | "bold">): number {
  if (layer.weight != null) return layer.weight;
  return layer.bold ? 700 : 400;
}

/**
 * A copy of a layer, offset so it is visibly a second one.
 *
 * Placing it exactly on top would look like nothing happened, and the first
 * thing anyone does after duplicating is drag it anyway.
 */
export function duplicateLayer(layer: Layer, canvas: Canvas): Layer {
  counter += 1;
  const offset = 24;
  const next = clampToCanvas(
    { x: layer.x + offset, y: layer.y + offset },
    canvas
  );
  return {
    ...layer,
    ...next,
    id: `${layer.type}-${Date.now().toString(36)}-${counter}`,
    name: layer.name ? `${layer.name} copy` : null,
    // A duplicate of a locked layer is not locked: it was just created to be
    // moved, and unlocking it first would be a pointless step.
    locked: false,
  };
}

/** How far an arrow-key nudge moves a layer, in artwork pixels. */
export const NUDGE = 1;
export const NUDGE_FAST = 10;

/**
 * Centre a layer on the artwork.
 *
 * Needs the layer's width, which a text layer may not have -- an auto-width
 * text layer has no measured box here, so it is centred on its x alone and
 * the caller leaves the axis unchanged rather than guessing.
 */
export function centreOnCanvas(
  layer: Layer,
  canvas: Canvas,
  axis: "x" | "y"
): Partial<Layer> | null {
  if (axis === "x") {
    if (!canvas.width || !layer.width) return null;
    return { x: Math.round((canvas.width - layer.width) / 2) };
  }
  const height = layer.height ?? (layer.type === "qr" ? layer.width : null);
  if (!canvas.height || !height) return null;
  return { y: Math.round((canvas.height - height) / 2) };
}
