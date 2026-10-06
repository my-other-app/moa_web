import { z } from "zod";

/**
 * Layers: content placed on a club's own artwork.
 *
 * Coordinates are in the artwork's own pixels, never the displayed size, so
 * the editor and the PDF renderer agree regardless of zoom or screen. Every
 * conversion between the two lives in `toArtwork` below rather than being
 * repeated at each drag handler.
 */
export const layerSchema = z.object({
  id: z.string(),
  type: z.enum(["text", "qr"]).default("text"),
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
export function withSampleValues(text: string, tokens: readonly TokenSpec[]): string {
  let out = text;
  for (const spec of tokens) {
    out = out.split(`{{${spec.token}}}`).join(spec.sample);
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
export function newLayer(type: Layer["type"], canvas: Canvas): Layer {
  counter += 1;
  const id = `${type}-${Date.now().toString(36)}-${counter}`;
  // Dropped near the top-left rather than at 0,0 so a new layer is visibly
  // inside the artwork and not tucked under its corner radius.
  const x = Math.round((canvas.width || 800) * 0.1);
  const y = Math.round((canvas.height || 600) * 0.1);
  return type === "qr"
    ? { id, type, name: "QR code", text: "", x, y, width: 160, font_size: 24, color: "#ffffff", align: "left", bold: false, max_lines: 1, line_spacing: 0 }
    : { id, type, name: null, text: "{{name}}", x, y, width: null, font_size: 32, color: "#ffffff", align: "left", bold: false, max_lines: 1, line_spacing: 0 };
}

/** What the layers list calls a layer. */
export function layerLabel(layer: Layer): string {
  if (layer.name) return layer.name;
  if (layer.type === "qr") return "QR code";
  return layer.text.trim() || "Empty text";
}
