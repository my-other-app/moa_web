import { z } from "zod";

/**
 * Layout v2: a design as absolutely positioned layers on a fixed canvas
 * (feature-register/layout-v2-contract.md, "The v2 schema"). The wire format
 * is camelCase, and these bounds are the backend's pydantic model's
 * (`app/core/layout_v2`), so what the editor accepts the API accepts.
 *
 * Every field the contract gives a default has it here; so do the optional
 * ones, so a layer the editor makes from a few fields parses whole. A parsed
 * layout is always complete: the editor saves the parsed form.
 */

export const V2_LIMITS = {
  canvasMin: 300,
  canvasMax: 3000,
  maxLayers: 150,
  maxText: 2000,
  maxMarkup: 60_000,
  maxPath: 20_000,
  /** Canvas aspect against the page's, either way. */
  aspectTolerance: 0.015,
  coord: 20_000,
} as const;

// ─── Colours and fills ──────────────────────────────────────────────────────

export const HEX_COLOR = /^#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$/;
export const COLOR_REFS = ["var:accent", "brand.primary", "brand.secondary", "ticket_type"] as const;
export type ColorRefV2 = (typeof COLOR_REFS)[number];

const COLOR_MESSAGE = "Use a colour like #1DB9A0 (or #1DB9A080 with alpha), var:accent, brand.primary, brand.secondary or ticket_type.";

/** "#RRGGBB", "#RRGGBBAA", the document's accent, the club's brand, or the ticket type's colour. */
export const ColorV2 = z.string().refine((v) => HEX_COLOR.test(v) || (COLOR_REFS as readonly string[]).includes(v), { message: COLOR_MESSAGE });
export type ColorV2 = string;

/** The document's accent: a plain #RRGGBB. */
export const AccentColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, { message: "The accent is a colour like #FF8A3D." });

export const GradientStop = z.object({
  offset: z.number().finite().min(0).max(1),
  color: ColorV2,
});
export type GradientStop = z.infer<typeof GradientStop>;

const Stops = z
  .array(GradientStop)
  .min(2, { message: "A gradient has 2 to 6 colour stops." })
  .max(6, { message: "A gradient has 2 to 6 colour stops." });

export const SolidFill = z.object({ type: z.literal("solid"), color: ColorV2 });
export const LinearFill = z.object({ type: z.literal("linear"), angle: z.number().finite().min(-360).max(360), stops: Stops });
export const RadialFill = z.object({
  type: z.literal("radial"),
  cx: z.number().finite().min(0).max(1),
  cy: z.number().finite().min(0).max(1),
  stops: Stops,
});
export const FillV2 = z.discriminatedUnion("type", [SolidFill, LinearFill, RadialFill]);
export type FillV2 = z.infer<typeof FillV2>;
export type SolidFill = z.infer<typeof SolidFill>;
export type LinearFill = z.infer<typeof LinearFill>;
export type RadialFill = z.infer<typeof RadialFill>;

export const ShadowV2 = z.object({
  x: z.number().finite().min(-1000).max(1000),
  y: z.number().finite().min(-1000).max(1000),
  blur: z.number().finite().min(0).max(1000),
  spread: z.number().finite().min(-1000).max(1000).default(0),
  color: ColorV2,
});
export type ShadowV2 = z.infer<typeof ShadowV2>;

/** Four sides or corners. A single number is all four. */
export type Quad = [number, number, number, number];
const quadOf = (max: number) =>
  z
    .union([z.number().finite().min(0).max(max), z.tuple([z.number().finite().min(0).max(max), z.number().finite().min(0).max(max), z.number().finite().min(0).max(max), z.number().finite().min(0).max(max)])])
    .transform((v): Quad => (typeof v === "number" ? [v, v, v, v] : [v[0], v[1], v[2], v[3]]));
/** [top-left, top-right, bottom-right, bottom-left], px. */
export const Corners = quadOf(10_000).default(0);
/** [top, right, bottom, left], px. */
export const Padding = quadOf(2_000).default(0);

// ─── Layers ─────────────────────────────────────────────────────────────────

export const LAYER_ID = /^[A-Za-z0-9_-]{1,64}$/;
export const TOKEN_NAME = /^[A-Za-z0-9_.]{1,80}$/;

const coord = z.number().finite().min(-V2_LIMITS.coord).max(V2_LIMITS.coord);
const extent = z.number().finite().positive({ message: "A layer is wider and taller than 0 px." }).max(V2_LIMITS.coord);

const LayerCommon = z.object({
  id: z.string().regex(LAYER_ID, { message: "Layer ids are 1 to 64 letters, digits, - and _." }),
  name: z.string().trim().min(1, { message: "Give the layer a name." }).max(80),
  x: coord,
  y: coord,
  width: extent,
  height: extent,
  /** Degrees, clockwise, about the box's centre. */
  rotation: z.number().finite().min(-360).max(360).default(0),
  opacity: z.number().finite().min(0).max(1).default(1),
  hidden: z.boolean().default(false),
  locked: z.boolean().default(false),
  /** Left out when this token's value is empty after trimming. */
  showIf: z.string().trim().regex(TOKEN_NAME, { message: "showIf names one token, like organization." }).nullable().default(null),
  /** Already on the card stock: drawn on screen, skipped when printed. */
  preprinted: z.boolean().default(false),
  shadow: ShadowV2.nullable().default(null),
});

export const FontV2 = z.object({
  /** A CSS family name from the font list (fonts.lock.json), or one of the v1 keys. */
  family: z.string().trim().min(1, { message: "Choose a font." }).max(80),
  weight: z.number().int().min(100).max(900).default(400),
  style: z.enum(["normal", "italic"]).default("normal"),
});
export type FontV2 = z.infer<typeof FontV2>;

export const TextLayerV2 = LayerCommon.extend({
  kind: z.literal("text"),
  /** A template: literal text, {{tokens}} with filters, and {% if %} blocks. */
  text: z.string().max(V2_LIMITS.maxText, { message: `At most ${V2_LIMITS.maxText} characters.` }),
  font: FontV2,
  size: z.number().finite().min(1).max(1000),
  color: ColorV2.default("#000000"),
  /** em, like CSS letter-spacing in em. */
  letterSpacing: z.number().finite().min(-1).max(5).default(0),
  /** Unitless, a multiple of the size. */
  lineHeight: z.number().finite().min(0.5).max(5).default(1.2),
  align: z.enum(["left", "center", "right"]).default("left"),
  valign: z.enum(["top", "middle", "bottom"]).default("top"),
  transform: z.enum(["none", "upper", "lower"]).default("none"),
  maxLines: z.number().int().min(1).max(20).default(1),
  /** shrink: 1 px at a time down to minSize, then an ellipsis. ellipsis: cut at once. none: as it falls. */
  fit: z.enum(["shrink", "ellipsis", "none"]).default("shrink"),
  /** px; when left out, 60% of the size, rounded down (layoutV2's defaults). */
  minSize: z.number().finite().min(1).max(1000),
  background: FillV2.nullable().default(null),
  padding: Padding,
  radius: Corners,
});
export type TextLayerV2 = z.infer<typeof TextLayerV2>;

/** Path commands an outline may use, absolute, in the layer box's own px. */
export const SHAPE_PATH = /^\s*M[\sMLHVCQAZ0-9.,eE+-]*$/;

export const StrokeV2 = z.object({
  color: ColorV2,
  width: z.number().finite().min(0).max(1000),
  /** [dash, gap] px; null for a solid line. */
  dash: z.tuple([z.number().finite().min(0).max(1000), z.number().finite().min(0).max(1000)]).nullable().default(null),
});
export type StrokeV2 = z.infer<typeof StrokeV2>;

export const ShapeLayerV2 = LayerCommon.extend({
  kind: z.literal("shape"),
  shape: z.enum(["rect", "ellipse", "path"]).default("rect"),
  /** For shape "path": M/L/H/V/C/Q/A/Z in a viewBox of the layer box (0 0 width height). */
  path: z
    .string()
    .max(V2_LIMITS.maxPath)
    .regex(SHAPE_PATH, { message: "An outline uses only M, L, H, V, C, Q, A and Z with numbers." })
    .nullable()
    .default(null),
  fill: FillV2.nullable().default(null),
  stroke: StrokeV2.nullable().default(null),
  radius: Corners,
});
export type ShapeLayerV2 = z.infer<typeof ShapeLayerV2>;

export const RECOLOR_KEY = /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

export const SvgLayerV2 = LayerCommon.extend({
  kind: z.literal("svg"),
  /** Sanitised: no script, no on* handlers, no external href (svgProblems). */
  markup: z.string().min(1, { message: "An SVG layer needs its markup." }).max(V2_LIMITS.maxMarkup, { message: `SVG markup is at most ${V2_LIMITS.maxMarkup} characters.` }),
  fit: z.enum(["contain", "cover", "stretch"]).default("contain"),
  /** A colour in the markup -> what to paint instead. */
  recolor: z.record(z.string().regex(RECOLOR_KEY, { message: "Recolour a colour written like #FF8A3D." }), ColorV2).nullable().default(null),
});
export type SvgLayerV2 = z.infer<typeof SvgLayerV2>;

export const IMAGE_SOURCES = ["upload", "org_logo", "event_icon", "guest_photo", "signature_1", "signature_2", "sponsor"] as const;
export const ImageSourceV2 = z.enum(IMAGE_SOURCES);
export type ImageSourceV2 = z.infer<typeof ImageSourceV2>;
export const IMAGE_SOURCE_LABEL_V2: Record<ImageSourceV2, string> = {
  upload: "An uploaded image",
  org_logo: "Club logo",
  event_icon: "Event poster",
  guest_photo: "Guest photo (initials when there is none)",
  signature_1: "First signature",
  signature_2: "Second signature",
  sponsor: "Sponsor logos",
};

export const ImageLayerV2 = LayerCommon.extend({
  kind: z.literal("image"),
  source: ImageSourceV2.default("upload"),
  imageKey: z.string().max(300).nullable().default(null),
  fit: z.enum(["contain", "cover"]).default("contain"),
  radius: Corners,
  border: z.object({ color: ColorV2, width: z.number().finite().min(0).max(500) }).nullable().default(null),
  /** guest_photo with no photo: an initials tile, or nothing. */
  placeholder: z.enum(["initials", "none"]).default("initials"),
});
export type ImageLayerV2 = z.infer<typeof ImageLayerV2>;

const upper = (v: unknown) => (typeof v === "string" ? v.toUpperCase() : v);

export const QrLayerV2 = LayerCommon.extend({
  kind: z.literal("qr"),
  /** Always black on white: a scanner reads it everywhere. */
  dark: z.preprocess(upper, z.literal("#000000", { errorMap: () => ({ message: "A QR code is black on white." }) })).default("#000000"),
  light: z.preprocess(upper, z.literal("#FFFFFF", { errorMap: () => ({ message: "A QR code is black on white." }) })).default("#FFFFFF"),
  /** Blank modules around the code. */
  quietZone: z.number().int().min(0).max(4).default(2),
  background: FillV2.nullable().default(null),
  radius: Corners,
});
export type QrLayerV2 = z.infer<typeof QrLayerV2>;

export const LayerV2 = z.discriminatedUnion("kind", [TextLayerV2, ShapeLayerV2, SvgLayerV2, ImageLayerV2, QrLayerV2]);
export type LayerV2 = z.infer<typeof LayerV2>;
export type LayerKindV2 = LayerV2["kind"];
export type LayerOfKind<K extends LayerKindV2> = Extract<LayerV2, { kind: K }>;
export const LAYER_KINDS_V2: readonly LayerKindV2[] = ["text", "shape", "svg", "image", "qr"];

/** minSize when a text layer leaves it out: 60% of the size, whole px, at least 1. */
export const defaultMinSize = (size: number) => Math.max(1, Math.floor(size * 0.6));

const withDefaults = (raw: unknown) => {
  if (!Array.isArray(raw)) return raw;
  return raw.map((l: unknown) => {
    if (l && typeof l === "object" && (l as { kind?: unknown }).kind === "text") {
      const t = l as { size?: unknown; minSize?: unknown };
      if (t.minSize === undefined && typeof t.size === "number" && Number.isFinite(t.size)) return { ...t, minSize: defaultMinSize(t.size) };
    }
    return l;
  });
};

// ─── The document ───────────────────────────────────────────────────────────

export const PageV2 = z.object({
  widthMm: z.number().finite().min(10).max(2000),
  heightMm: z.number().finite().min(10).max(2000),
});
export type PageV2 = z.infer<typeof PageV2>;

const canvasSide = z
  .number()
  .finite()
  .min(V2_LIMITS.canvasMin, { message: `The canvas is ${V2_LIMITS.canvasMin} to ${V2_LIMITS.canvasMax} px each way.` })
  .max(V2_LIMITS.canvasMax, { message: `The canvas is ${V2_LIMITS.canvasMin} to ${V2_LIMITS.canvasMax} px each way.` });

export const CanvasV2 = z.object({
  width: canvasSide,
  height: canvasSide,
  background: FillV2.nullable().default(null),
});
export type CanvasV2 = z.infer<typeof CanvasV2>;

export const DEFAULT_ACCENT = "#FF8A3D";
export const VarsV2 = z.object({ accent: AccentColor.default(DEFAULT_ACCENT) });
export type VarsV2 = z.infer<typeof VarsV2>;

export const LayoutV2 = z.object({
  version: z.literal(2),
  page: PageV2,
  canvas: CanvasV2,
  vars: VarsV2.default({}),
  /** Paint order: the first is at the bottom. */
  layers: z.preprocess(withDefaults, z.array(LayerV2).max(V2_LIMITS.maxLayers, { message: `At most ${V2_LIMITS.maxLayers} layers.` })),
});
export type LayoutV2 = z.infer<typeof LayoutV2>;
/** What may be sent: defaults may be left out. */
export type LayoutV2Input = z.input<typeof LayoutV2>;

/** The kinds of document a layout is for. */
export const DOC_KINDS = ["ticket", "certificate", "badge"] as const;
export type DocKind = (typeof DOC_KINDS)[number];

/** Parse a layout, throwing a ZodError when it is not one. */
export const parseLayoutV2 = (raw: unknown): LayoutV2 => LayoutV2.parse(raw);

/** A layer with every default filled in, from as few fields as a caller gives. */
export const layerV2 = <K extends LayerKindV2>(raw: { kind: K } & Record<string, unknown>): LayerOfKind<K> =>
  LayerV2.parse((withDefaults([raw]) as unknown[])[0]) as LayerOfKind<K>;

export const isV2Layout = (raw: unknown): boolean => !!raw && typeof raw === "object" && (raw as { version?: unknown }).version === 2;
