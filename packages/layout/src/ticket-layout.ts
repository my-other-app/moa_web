import { z } from "zod";

import { TICKET_FONTS, type TicketFont } from "./fonts";

/**
 * The layer, canvas and page schemas -- the wire format a design is saved
 * in. Bounds mirror the backend's model exactly, so a value the editor
 * accepts is a value the API accepts.
 */

export const HexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, { message: "Use a 6-digit hex colour, like #1db9a0." });

// ─── Colours ───────────────────────────────────────────────────────────────

/** A fixed colour, or one that follows the club's brand or the ticket type. */
export const ColorRef = z.union([HexColor, z.enum(["brand.primary", "brand.secondary", "ticket_type"])]);
export type ColorRef = z.infer<typeof ColorRef>;

export const COLOR_REF_LABEL: Record<Exclude<ColorRef, `#${string}`>, string> = {
  "brand.primary": "Club primary",
  "brand.secondary": "Club secondary",
  ticket_type: "Ticket type colour",
};

export const resolveColor = (ref: ColorRef, ctx: { primary: string; secondary: string; ticketType: string }) =>
  ref === "brand.primary" ? ctx.primary : ref === "brand.secondary" ? ctx.secondary : ref === "ticket_type" ? ctx.ticketType : ref;

export const luminance = (hex: string) => {
  const n = parseInt(hex.replace("#", ""), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
};
export const contrastRatio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

// ─── Layers ────────────────────────────────────────────────────────────────

const TicketFontSchema = z.enum(Object.keys(TICKET_FONTS) as [TicketFont, ...TicketFont[]]);

const LayerBase = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, { message: "Layer ids are letters, digits, - and _." }),
  name: z.string().trim().min(1, { message: "Give the layer a name." }).max(60),
  x: z.number().finite().min(-10_000).max(10_000),
  y: z.number().finite().min(-10_000).max(10_000),
  hidden: z.boolean().default(false),
  locked: z.boolean().default(false),
  /** Already on the card stock: drawn on screen, skipped when printed. */
  preprinted: z.boolean().default(false),
});

export const TextLayer = LayerBase.extend({
  kind: z.literal("text"),
  /** A template: literal text, {{tokens}}, and {% if %} blocks. */
  text: z.string().max(600),
  width: z.number().min(10).max(10_000),
  font: TicketFontSchema.default("inter"),
  weight: z.number().int().min(100).max(900).default(400),
  size: z.number().min(4).max(800),
  color: ColorRef.default("#141614"),
  align: z.enum(["left", "center", "right"]).default("left"),
  maxLines: z.number().int().min(1).max(12).default(1),
  /** Extra pixels between lines, on top of 1.2 × the size. */
  lineSpacing: z.number().min(-200).max(800).default(0),
  letterSpacing: z.number().min(-50).max(200).default(0),
  /** When the text will not fit: shrink it (down to half size) before cutting it short. */
  fit: z.enum(["shrink", "truncate"]).default("shrink"),
  opacity: z.number().min(0).max(1).default(1),
});
export type TextLayer = z.infer<typeof TextLayer>;

export const QrLayer = LayerBase.extend({
  kind: z.literal("qr"),
  size: z.number().min(1).max(10_000),
  /** Blank modules around the code. Scanners want at least one; two is safe. */
  quietZone: z.number().int().min(0).max(4).default(2),
  dark: HexColor.default("#000000"),
  light: z.union([HexColor, z.literal("transparent")]).default("#FFFFFF"),
});
export type QrLayer = z.infer<typeof QrLayer>;

export const ImageSource = z.enum(["upload", "org_logo", "event_icon", "guest_photo"]);
export type ImageSource = z.infer<typeof ImageSource>;
export const IMAGE_SOURCE_LABEL: Record<ImageSource, string> = {
  upload: "An uploaded image",
  org_logo: "Club logo",
  event_icon: "Event poster",
  guest_photo: "Guest photo (initials when there is none)",
};

export const ImageLayer = LayerBase.extend({
  kind: z.literal("image"),
  width: z.number().min(1).max(10_000),
  height: z.number().min(1).max(10_000),
  source: ImageSource.default("upload"),
  imageKey: z.string().max(300).nullable().default(null),
  fit: z.enum(["contain", "cover"]).default("contain"),
  align: z.enum(["left", "center", "right"]).default("center"),
  radius: z.number().min(0).max(5_000).default(0),
  opacity: z.number().min(0).max(1).default(1),
});
export type ImageLayer = z.infer<typeof ImageLayer>;

export const SHAPE_PATH_BOX = 1000;
export const ShapePath = z
  .string()
  .trim()
  .max(4000)
  .regex(/^M[\sMLCQZ0-9.,-]*$/, { message: "An outline uses only M, L, C, Q and Z with numbers." });

export const ShapeLayer = LayerBase.extend({
  kind: z.literal("shape"),
  width: z.number().min(0.5).max(10_000),
  height: z.number().min(0.5).max(10_000),
  fill: ColorRef.nullable().default("#1B6B47"),
  stroke: ColorRef.nullable().default(null),
  strokeWidth: z.number().min(0).max(200).default(0),
  radius: z.number().min(0).max(5_000).default(0),
  opacity: z.number().min(0).max(1).default(1),
  /** Null draws the rounded rectangle; an outline draws that curve in the box instead. */
  path: ShapePath.nullable().default(null),
});
export type ShapeLayer = z.infer<typeof ShapeLayer>;

/** A shape's outline in real units: every x times sx, every y times sy. */
export const scaleShapePath = (path: string, sx: number, sy: number) => {
  let i = 0;
  return path.replace(/-?\d*\.?\d+(?:e-?\d+)?/gi, (n) => {
    const v = Number(n) * (i++ % 2 === 0 ? sx : sy);
    return String(Math.round(v * 100) / 100);
  });
};

/**
 * The run of show, laid into a box: time, title and detail per session.
 * Rows that will not fit shrink first, then drop with a "+N more" line.
 * One per design; the sessions come from the event, never from the layer.
 */
export const AgendaLayer = LayerBase.extend({
  kind: z.literal("agenda"),
  width: z.number().min(40).max(10_000),
  height: z.number().min(20).max(10_000),
  font: TicketFontSchema.default("inter"),
  /** Title size; times and details are scaled from it. */
  size: z.number().min(6).max(400).default(28),
  color: ColorRef.default("#141614"),
  /** Times and day headings. */
  accent: ColorRef.default("brand.primary"),
  /** Speaker and location. */
  muted: ColorRef.default("#5A5F5B"),
  align: z.enum(["left", "center", "right"]).default("left"),
  /** Extra pixels between sessions. */
  rowGap: z.number().min(0).max(1_000).default(16),
  columns: z.number().int().min(1).max(3).default(1),
  showSpeaker: z.boolean().default(true),
  showLocation: z.boolean().default(true),
  showDayHeadings: z.boolean().default(true),
  opacity: z.number().min(0).max(1).default(1),
});
export type AgendaLayer = z.infer<typeof AgendaLayer>;

export const TicketLayer = z.discriminatedUnion("kind", [TextLayer, QrLayer, ImageLayer, ShapeLayer, AgendaLayer]);
export type TicketLayer = z.infer<typeof TicketLayer>;
export type TicketLayerKind = TicketLayer["kind"];

// ─── Canvas and page ───────────────────────────────────────────────────────

/** The part of the canvas that is the ticket; the rest is artboard and is never printed. */
export const TicketArea = z.object({
  x: z.number().min(0).max(6000),
  y: z.number().min(0).max(6000),
  width: z.number().min(100).max(6000),
  height: z.number().min(50).max(6000),
  radius: z.number().min(0).max(3000).default(0),
});
export type TicketArea = z.infer<typeof TicketArea>;

export const TicketCanvas = z.object({
  width: z.number().int().min(300).max(6000),
  height: z.number().int().min(150).max(6000),
  /** Painted under everything; shows where the template is transparent or absent. */
  background: HexColor.default("#FFFFFF"),
  templateKey: z.string().max(300).nullable().default(null),
  templatePreprinted: z.boolean().default(false),
  /** Null means the whole canvas is the ticket. */
  area: TicketArea.nullable().default(null),
});
export type TicketCanvas = z.infer<typeof TicketCanvas>;

export const ticketArea = (canvas: { width: number; height: number; area?: TicketArea | null }): TicketArea =>
  canvas.area ?? { x: 0, y: 0, width: canvas.width, height: canvas.height, radius: 0 };

export const areaIsWholeCanvas = (canvas: { width: number; height: number }, a: TicketArea) =>
  a.x <= 0.5 && a.y <= 0.5 && Math.abs(a.x + a.width - canvas.width) <= 0.5 && Math.abs(a.y + a.height - canvas.height) <= 0.5 && a.radius === 0;

export const MM_PER_INCH = 25.4;
export const PT_PER_MM = 72 / MM_PER_INCH;

export const PageSpec = z.object({
  widthMm: z.number().min(20).max(1200),
  /** Null: the height follows the ticket area's shape. */
  heightMm: z.number().min(20).max(1200).nullable(),
});
export type PageSpec = z.infer<typeof PageSpec>;

export const TICKET_PAGE: PageSpec = { widthMm: 203.2, heightMm: null };

export const PAGE_PRESETS = {
  ticket: { label: "Ticket · 8 in wide", page: TICKET_PAGE },
  cr80_portrait: { label: "ID card · CR80 portrait · 54 × 85.6 mm", page: { widthMm: 54, heightMm: 85.6 } },
  cr80_landscape: { label: "ID card · CR80 landscape · 85.6 × 54 mm", page: { widthMm: 85.6, heightMm: 54 } },
  a6_portrait: { label: "Badge · A6 portrait · 105 × 148 mm", page: { widthMm: 105, heightMm: 148 } },
  badge_87x130: { label: "Badge insert · 87 × 130 mm", page: { widthMm: 87, heightMm: 130 } },
  badge_89x137: { label: "Badge insert · 89 × 137 mm", page: { widthMm: 89, heightMm: 137 } },
  badge_130x87: { label: "Badge insert · 130 × 87 mm landscape", page: { widthMm: 130, heightMm: 87 } },
  label_4x3: { label: "Badge label · 4 × 3 in", page: { widthMm: 101.6, heightMm: 76.2 } },
  lanyard_4x6: { label: "Lanyard label · 4 × 6 in", page: { widthMm: 101.6, heightMm: 152.4 } },
  label_29x90: { label: "Brother label · 29 × 90 mm", page: { widthMm: 29, heightMm: 90 } },
  label_38x90: { label: "Brother label · 38 × 90 mm", page: { widthMm: 38, heightMm: 90 } },
  label_50x90: { label: "Brother label · 50 × 90 mm", page: { widthMm: 50, heightMm: 90 } },
  label_54x90: { label: "Brother label · 54 × 90 mm", page: { widthMm: 54, heightMm: 90 } },
  label_62x90: { label: "Brother label · 62 × 90 mm", page: { widthMm: 62, heightMm: 90 } },
  screen_landscape: { label: "Kiosk screen · landscape 16:9", page: { widthMm: 332, heightMm: 186.75 } },
  screen_portrait: { label: "Kiosk screen · portrait 9:16", page: { widthMm: 186.75, heightMm: 332 } },
  a4_landscape: { label: "A4 landscape · 297 × 210 mm", page: { widthMm: 297, heightMm: 210 } },
  a4_portrait: { label: "A4 portrait · 210 × 297 mm", page: { widthMm: 210, heightMm: 297 } },
  letter_landscape: { label: "Letter landscape · 11 × 8.5 in", page: { widthMm: 279.4, heightMm: 215.9 } },
} as const satisfies Record<string, { label: string; page: PageSpec }>;
export type PagePreset = keyof typeof PAGE_PRESETS;

export const pagePresetOf = (page: PageSpec): PagePreset | null =>
  ((Object.keys(PAGE_PRESETS) as PagePreset[]).find(
    (k) => Math.abs(PAGE_PRESETS[k].page.widthMm - page.widthMm) < 0.05 && (PAGE_PRESETS[k].page.heightMm ?? -1) === (page.heightMm ?? -1)
  ) ?? null);

/** The page in points, from the ticket area's shape when the height is free. */
export const pageSizePt = (page: PageSpec, area: { width: number; height: number }) => {
  const width = page.widthMm * PT_PER_MM;
  const height = page.heightMm ? page.heightMm * PT_PER_MM : (width * area.height) / area.width;
  return { width, height };
};

/** Canvas pixels for a fixed page at a print resolution. */
export const canvasForPage = (page: PageSpec, dpi = 300) => ({
  width: Math.round((page.widthMm / MM_PER_INCH) * dpi),
  height: Math.round(((page.heightMm ?? page.widthMm) / MM_PER_INCH) * dpi),
});

export const pxPerMm = (page: PageSpec, area: { width: number }) => area.width / page.widthMm;

/** The smallest QR a phone reliably reads: a tenth of the short side, never under 96 px, never under 12 mm. */
export const minQrSize = (canvas: { width: number; height: number; area?: TicketArea | null }, page: PageSpec = TICKET_PAGE) => {
  const a = ticketArea(canvas);
  const physical = Math.round(12 * pxPerMm(page, a));
  return Math.max(96, physical, Math.round(Math.min(a.width, a.height) * 0.1));
};

export const MAX_LAYERS = 60;

export const TicketLayoutFields = z.object({
  canvas: TicketCanvas,
  layers: z.array(TicketLayer).min(1).max(MAX_LAYERS, { message: `At most ${MAX_LAYERS} layers.` }),
  page: PageSpec.default(TICKET_PAGE),
});
export type TicketLayoutFields = z.infer<typeof TicketLayoutFields>;
export type Layout = { canvas: TicketCanvas; layers: TicketLayer[]; page: PageSpec };
