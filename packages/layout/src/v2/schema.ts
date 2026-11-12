import { z } from "zod";

/**
 * Layout v2: a design as absolutely positioned layers on a fixed canvas
 * (feature-register/layout-v2-contract.md, "The v2 schema"). The wire
 * format is camelCase, and this is the backend's pydantic model
 * (`app/core/layout_v2/schema.py`) field for field: the same bounds, the
 * same defaults, the same normalising (hex colours upper case, one number
 * for four corners, an empty list of spans as none), unknown fields refused.
 * What the editor accepts, the API accepts.
 *
 *     {"version": 2,
 *      "page": {"widthMm": 101.6, "heightMm": 152.4},
 *      "canvas": {"width": 384, "height": 576, "background": Fill | null},
 *      "vars": {"accent": "#FF8A3D"},
 *      "layers": [Layer, ...]}
 *
 * Beyond the contract's first draft, as the backend has them: text `spans`,
 * `textWrap`, a `showIf` naming several tokens ("a b": all, "a|b": any), a
 * list of shadows with `inset`, image `align`/`valign`/`placeholderStyle`,
 * and the layout's `starter`.
 */

export const VERSION = 2;
export const V2_LIMITS = {
  maxLayers: 150,
  maxText: 2000,
  maxSpans: 40,
  maxMarkup: 60_000,
  maxPath: 20_000,
  canvasMin: 300,
  canvasMax: 3000,
  /** The canvas's shape must be the page's, within this share. */
  aspectTolerance: 0.015,
} as const;

export const HEX_COLOR = /^#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$/;
export const HEX6 = /^#[0-9A-Fa-f]{6}$/;
export const COLOR_REFS = ["var:accent", "brand.primary", "brand.secondary", "ticket_type"] as const;
export type ColorRefV2 = (typeof COLOR_REFS)[number];
export const LAYER_ID = /^[A-Za-z0-9_-]{1,40}$/;
/** A token name as showIf names it, or several: "a b" (every one), "a|b" (any one). */
export const SHOW_IF = /^\s*[A-Za-z0-9_.]+(?:\s*(?:\||\s)\s*[A-Za-z0-9_.]+)*\s*$/;
/** Path commands a shape may use, in the layer's own pixels. */
export const SHAPE_PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s+eE-]*$/;

const isRef = (v: string) => (COLOR_REFS as readonly string[]).includes(v);

/** The backend's check_color: a reference as it is, hex upper case, anything else refused. */
const color = (field = "color") =>
  z
    .string()
    .min(4)
    .max(16)
    .superRefine((v, ctx) => {
      if (!isRef(v) && !HEX_COLOR.test(v))
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${field}: use #RRGGBB, #RRGGBBAA, var:accent, brand.primary, brand.secondary or ticket_type` });
    })
    .transform((v) => (isRef(v) ? v : v.toUpperCase()));

/** "#RRGGBB", "#RRGGBBAA" (stored upper case), or var:accent, brand.primary, brand.secondary, ticket_type. */
export const ColorV2 = color();
export type ColorV2 = string;

// ─── Fills, strokes and shadows ─────────────────────────────────────────────

export const GradientStop = z.object({ offset: z.number().min(0).max(1), color: ColorV2 }).strict();
export type GradientStop = z.infer<typeof GradientStop>;
const Stops = z.array(GradientStop).min(2).max(6);

export const SolidFill = z.object({ type: z.literal("solid"), color: ColorV2 }).strict();
/** CSS linear-gradient: 0deg runs bottom to top, 90deg left to right. */
export const LinearFill = z.object({ type: z.literal("linear"), angle: z.number().min(-3600).max(3600), stops: Stops }).strict();
/** CSS radial-gradient(circle at cx cy, …), to the farthest corner. */
export const RadialFill = z
  .object({ type: z.literal("radial"), cx: z.number().min(0).max(1).default(0.5), cy: z.number().min(0).max(1).default(0.5), stops: Stops })
  .strict();
export const FillV2 = z.discriminatedUnion("type", [SolidFill, LinearFill, RadialFill]);
export type FillV2 = z.infer<typeof FillV2>;
export type SolidFill = z.infer<typeof SolidFill>;
export type LinearFill = z.infer<typeof LinearFill>;
export type RadialFill = z.infer<typeof RadialFill>;

/** A box shadow (on a text layer, a text shadow: spread and inset do nothing there). */
export const ShadowV2 = z
  .object({
    x: z.number().min(-1000).max(1000).default(0),
    y: z.number().min(-1000).max(1000).default(0),
    blur: z.number().min(0).max(1000).default(0),
    spread: z.number().min(-1000).max(1000).default(0),
    color: ColorV2.default("#00000040"),
    inset: z.boolean().default(false),
  })
  .strict();
export type ShadowV2 = z.infer<typeof ShadowV2>;

export const StrokeV2 = z
  .object({
    color: ColorV2,
    width: z.number().gt(0).max(500),
    /** [dash, gap] px; null for a solid line. */
    dash: z
      .array(z.number())
      .min(2)
      .max(2)
      .superRefine((v, ctx) => {
        if (v.some((x) => x < 0) || v.reduce((a, b) => a + b, 0) <= 0) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "dash: two lengths, a dash and a gap, not both zero" });
      })
      .nullable()
      .default(null),
  })
  .strict();
export type StrokeV2 = z.infer<typeof StrokeV2>;

export const BorderV2 = z.object({ color: ColorV2, width: z.number().gt(0).max(500) }).strict();
export type BorderV2 = z.infer<typeof BorderV2>;

/** Four sides or corners. */
export type Quad = [number, number, number, number];

/** The backend's _four: [t, r, b, l] (padding) or [tl, tr, br, bl] (radius); one number is all four; null is zeros. */
const four = (field: string, lo = 0) =>
  z.unknown().transform((v, ctx): Quad => {
    if (v === undefined || v === null) return [0, 0, 0, 0];
    const list = typeof v === "number" ? [v, v, v, v] : v;
    if (!Array.isArray(list) || list.length !== 4) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${field}: four numbers, or one` });
      return z.NEVER;
    }
    const out = list.map((x) => (typeof x === "number" ? x : typeof x === "string" && x.trim() !== "" ? Number(x) : NaN));
    if (out.some((x) => !Number.isFinite(x))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${field}: four numbers, or one` });
      return z.NEVER;
    }
    if (out.some((x) => x < lo || x > 5000)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${field}: from ${lo} to 5000` });
      return z.NEVER;
    }
    return out as Quad;
  });

// ─── Layers ─────────────────────────────────────────────────────────────────

const ShadowField = z
  .union([ShadowV2, z.array(ShadowV2)])
  .nullable()
  .default(null)
  .superRefine((v, ctx) => {
    if (Array.isArray(v) && v.length > 6) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "shadow: at most 6" });
  })
  .transform((v) => (Array.isArray(v) && v.length === 0 ? null : v));

const LayerBase = z.object({
  id: z.string().regex(LAYER_ID, { message: `String should match pattern '${LAYER_ID.source}'` }),
  name: z
    .string()
    .min(1)
    .max(60)
    .transform((v) => v.trim())
    .superRefine((v, ctx) => {
      if (!v) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Give the layer a name." });
    }),
  x: z.number().min(-10_000).max(10_000),
  y: z.number().min(-10_000).max(10_000),
  width: z.number().gt(0).max(10_000),
  height: z.number().gt(0).max(10_000),
  /** Degrees, clockwise, about the box's centre. */
  rotation: z.number().min(-360).max(360).default(0),
  opacity: z.number().min(0).max(1).default(1),
  hidden: z.boolean().default(false),
  locked: z.boolean().default(false),
  /** Left out when this token's value is empty (after trimming). Several tokens: "a b" needs every one, "a|b" any one. */
  showIf: z
    .string()
    .max(200)
    .nullable()
    .default(null)
    .transform((v) => (v === null ? null : v.trim() || null))
    .superRefine((v, ctx) => {
      if (v !== null && !SHOW_IF.test(v)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "showIf: a token, or tokens separated by spaces (all) or | (any)" });
    }),
  /** Already on the card stock: drawn on screen, skipped when printed on it. */
  preprinted: z.boolean().default(false),
  /** One shadow, or up to six. */
  shadow: ShadowField,
});

export const FontV2 = z
  .object({
    /** A CSS family name from the font list (fonts.lock.json). */
    family: z.string().min(1).max(80),
    weight: z.number().int().min(100).max(900).default(400),
    style: z.enum(["normal", "italic"]).default("normal"),
  })
  .strict();
export type FontV2 = z.infer<typeof FontV2>;

const Transform = z.enum(["none", "upper", "lower"]);

/**
 * Words in one paragraph that look different from the rest of it (a bold
 * course title in a sentence). Unset fields take the layer's. `size` is px;
 * it scales with the layer when the layer's text shrinks.
 */
export const SpanV2 = z
  .object({
    text: z.string().max(V2_LIMITS.maxText),
    family: z.string().min(1).max(80).nullable().default(null),
    weight: z.number().int().min(100).max(900).nullable().default(null),
    style: z.enum(["normal", "italic"]).nullable().default(null),
    size: z.number().gt(0).max(800).nullable().default(null),
    color: ColorV2.nullable().default(null),
    letterSpacing: z.number().min(-1).max(4).nullable().default(null),
    transform: Transform.nullable().default(null),
  })
  .strict();
export type SpanV2 = z.infer<typeof SpanV2>;

export const TextLayerV2 = LayerBase.extend({
  kind: z.literal("text"),
  /** The token language: {{token}}, {{token | upper}}, {% if token %}…{% else %}…{% endif %}. */
  text: z.string().max(V2_LIMITS.maxText).default(""),
  /** Styled runs, in order; when set, they are the text (and `text` is their join). */
  spans: z.array(SpanV2).max(V2_LIMITS.maxSpans).nullable().default(null),
  font: FontV2.default({ family: "Inter" }),
  size: z.number().gt(0).max(800).default(16),
  color: ColorV2.default("#141614"),
  /** em */
  letterSpacing: z.number().min(-1).max(4).default(0),
  /** unitless */
  lineHeight: z.number().min(0.5).max(4).default(1.2),
  align: z.enum(["left", "center", "right"]).default("left"),
  valign: z.enum(["top", "middle", "bottom"]).default("top"),
  transform: Transform.default("none"),
  textWrap: z.enum(["normal", "balance", "pretty"]).default("normal"),
  maxLines: z.number().int().min(1).max(20).default(1),
  /** shrink: 1 px at a time down to minSize, then an ellipsis. ellipsis: the clamp alone. none: as it falls. */
  fit: z.enum(["shrink", "ellipsis", "none"]).default("shrink"),
  /** The smallest size shrink goes to; null is half the size (textFloor). Never above the size. */
  minSize: z.number().gt(0).max(800).nullable().default(null),
  background: FillV2.nullable().default(null),
  padding: four("padding"),
  radius: four("radius"),
});
export type TextLayerV2 = z.infer<typeof TextLayerV2>;

export const ShapeLayerV2 = LayerBase.extend({
  kind: z.literal("shape"),
  shape: z.enum(["rect", "ellipse", "path"]).default("rect"),
  /** For "path": M/L/H/V/C/S/Q/T/A/Z in the layer's own pixels (0..width, 0..height). */
  path: z
    .string()
    .max(V2_LIMITS.maxPath)
    .nullable()
    .default(null)
    .transform((v) => (v === null ? null : v.split(/\s+/).filter(Boolean).join(" ") || null))
    .superRefine((v, ctx) => {
      if (v !== null && (!SHAPE_PATH.test(v) || !"Mm".includes(v[0]!)))
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "path: SVG path commands (M, L, H, V, C, S, Q, T, A, Z) and numbers, starting with M" });
    }),
  fill: FillV2.nullable().default(null),
  stroke: StrokeV2.nullable().default(null),
  radius: four("radius"),
});
export type ShapeLayerV2 = z.infer<typeof ShapeLayerV2>;

export const SvgLayerV2 = LayerBase.extend({
  kind: z.literal("svg"),
  /** One <svg> element; sanitised before it is drawn (sanitizeSvg). */
  markup: z.string().min(10).max(V2_LIMITS.maxMarkup),
  fit: z.enum(["contain", "cover", "stretch"]).default("contain"),
  /** Colour replacements: {"#RRGGBB": Color}, matched in fill/stroke/stop-color/style. */
  recolor: z
    .record(z.string(), color("recolor"))
    .nullable()
    .default(null)
    .transform((v, ctx) => {
      if (!v || !Object.keys(v).length) return null;
      if (Object.keys(v).length > 32) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "recolor: at most 32 colours" });
        return z.NEVER;
      }
      const out: Record<string, string> = {};
      for (const [k, c] of Object.entries(v)) {
        if (!HEX_COLOR.test(k)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `recolor: ${pyRepr(k)} is not a #RRGGBB colour` });
          return z.NEVER;
        }
        out[k.toUpperCase()] = c;
      }
      return out;
    }),
});
export type SvgLayerV2 = z.infer<typeof SvgLayerV2>;

export const IMAGE_SOURCES = ["upload", "org_logo", "event_icon", "guest_photo", "signature_1", "signature_2", "sponsor"] as const;
export const ImageSourceV2 = z.enum(IMAGE_SOURCES);
export type ImageSourceV2 = z.infer<typeof ImageSourceV2>;
export const IMAGE_SOURCE_LABEL_V2: Record<ImageSourceV2, string> = {
  upload: "An uploaded image",
  org_logo: "Club logo",
  event_icon: "Event poster",
  guest_photo: "Guest photo",
  signature_1: "First signature",
  signature_2: "Second signature",
  sponsor: "Sponsor logos",
};

/** How the initials tile looks when a guest has no photo. */
export const PlaceholderStyleV2 = z
  .object({
    color: ColorV2.default("#3C4257"),
    background: FillV2.nullable().default(null),
    family: z.string().min(1).max(80).default("Inter"),
    weight: z.number().int().min(100).max(900).default(700),
  })
  .strict();
export type PlaceholderStyleV2 = z.infer<typeof PlaceholderStyleV2>;

export const ImageLayerV2 = LayerBase.extend({
  kind: z.literal("image"),
  source: ImageSourceV2.default("upload"),
  imageKey: z.string().max(300).nullable().default(null),
  fit: z.enum(["contain", "cover"]).default("contain"),
  align: z.enum(["left", "center", "right"]).default("center"),
  valign: z.enum(["top", "middle", "bottom"]).default("middle"),
  radius: four("radius"),
  border: BorderV2.nullable().default(null),
  /** A guest photo with no photo: an initials tile, or nothing. */
  placeholder: z.enum(["initials", "none"]).default("none"),
  placeholderStyle: PlaceholderStyleV2.nullable().default(null),
});
export type ImageLayerV2 = z.infer<typeof ImageLayerV2>;

const upper = (v: unknown) => (typeof v === "string" ? v.toUpperCase() : v);

/** What it encodes is the kind's (a ticket's or badge's ticket code, a certificate's verify address); never editable; always black on white. */
export const QrLayerV2 = LayerBase.extend({
  kind: z.literal("qr"),
  dark: z.preprocess(upper, z.literal("#000000")).default("#000000"),
  light: z.preprocess(upper, z.literal("#FFFFFF")).default("#FFFFFF"),
  quietZone: z.number().int().min(0).max(4).default(0),
  background: FillV2.nullable().default(null),
  radius: four("radius"),
});
export type QrLayerV2 = z.infer<typeof QrLayerV2>;

export const LayerV2 = z.discriminatedUnion("kind", [TextLayerV2.strict(), ShapeLayerV2.strict(), SvgLayerV2.strict(), ImageLayerV2.strict(), QrLayerV2.strict()]);
export type LayerV2 = z.infer<typeof LayerV2>;
export type LayerKindV2 = LayerV2["kind"];
export type LayerOfKind<K extends LayerKindV2> = Extract<LayerV2, { kind: K }>;
export const LAYER_KINDS_V2 = ["text", "shape", "svg", "image", "qr"] as const;

// ─── The document ───────────────────────────────────────────────────────────

export const PageV2 = z.object({ widthMm: z.number().min(20).max(1200), heightMm: z.number().min(20).max(1200) }).strict();
export type PageV2 = z.infer<typeof PageV2>;

export const CanvasV2 = z
  .object({
    width: z.number().min(V2_LIMITS.canvasMin).max(V2_LIMITS.canvasMax),
    height: z.number().min(V2_LIMITS.canvasMin).max(V2_LIMITS.canvasMax),
    background: FillV2.nullable().default(null),
  })
  .strict();
export type CanvasV2 = z.infer<typeof CanvasV2>;

export const VarsV2 = z
  .object({
    /** The document's accent: what var:accent paints. */
    accent: z
      .string()
      .nullable()
      .default(null)
      .superRefine((v, ctx) => {
        if (v !== null && !HEX6.test(v)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "accent: a colour like #1F3BD8" });
      })
      .transform((v) => (v === null ? null : v.toUpperCase())),
  })
  .strict();
export type VarsV2 = z.infer<typeof VarsV2>;

const layoutObject = z
  .object({
    version: z.literal(2).default(2),
    page: PageV2,
    canvas: CanvasV2,
    vars: VarsV2.default({}),
    /** Paint order: the first is at the bottom. */
    layers: z.array(LayerV2).max(V2_LIMITS.maxLayers).default([]),
    /** The starter it was copied from ("badge/06-thermal-mono"), if any. */
    starter: z.string().max(80).nullable().default(null),
  })
  .strict();

/** The model validators: a text's spans are its text, and minSize never above the size; a path shape has its path. */
export const LayoutV2 = layoutObject.superRefine((l, ctx) => {
  l.layers.forEach((layer, i) => {
    if (layer.kind === "shape" && layer.shape === "path" && !layer.path)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["layers", i], message: "a path shape needs its path" });
  });
}).transform((l) => ({ ...l, layers: l.layers.map(normaliseLayer) }));
export type LayoutV2 = z.output<typeof layoutObject>;
/** What may be sent: defaults may be left out. */
export type LayoutV2Input = z.input<typeof layoutObject>;

/** The text model validator: spans are the text; minSize at most size. */
export const normaliseLayer = <L extends LayerV2>(layer: L): L => {
  if (layer.kind !== "text") return layer;
  const t = layer as TextLayerV2;
  const spans = t.spans && t.spans.length ? t.spans : null;
  const text = spans ? spans.map((s) => s.text).join("") : t.text;
  const minSize = t.minSize !== null && t.minSize > t.size ? t.size : t.minSize;
  return { ...t, spans, text, minSize } as L;
};

/** The kinds of document a layout is for. */
export const DOC_KINDS = ["ticket", "certificate", "badge"] as const;
export type DocKind = (typeof DOC_KINDS)[number];

/** A layout from its wire form; throws a ZodError when the shape is wrong (validate() reports it instead). */
export const parseLayoutV2 = (raw: unknown): LayoutV2 => LayoutV2.parse(raw) as LayoutV2;

/** A layer with every default filled in, from as few fields as a caller gives. */
export const layerV2 = <K extends LayerKindV2>(raw: { kind: K } & Record<string, unknown>): LayerOfKind<K> =>
  normaliseLayer(LayerV2.parse(raw)) as LayerOfKind<K>;

/** Whether a stored `config.layout` is a v2 layout. */
export const isV2Layout = (raw: unknown): boolean =>
  !!raw && typeof raw === "object" && (raw as { version?: unknown }).version === VERSION && "layers" in (raw as object);

/** A layer's shadows as a list (the wire allows one or several). */
export const shadowsOf = (layer: Pick<LayerV2, "shadow">): ShadowV2[] => (layer.shadow === null ? [] : Array.isArray(layer.shadow) ? layer.shadow : [layer.shadow]);

/** The smallest size `shrink` goes to: minSize, else half the size (Python's round to 3 places). */
export const textFloor = (layer: Pick<TextLayerV2, "minSize" | "size">) => (layer.minSize !== null ? layer.minSize : pyRound(layer.size * 0.5, 3));

/** The wire form without nulls (the backend's `dump`: exclude_none). */
export const dumpLayoutV2 = (layout: LayoutV2): Record<string, unknown> => dropNulls(layout) as Record<string, unknown>;

const dropNulls = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(dropNulls);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null && x !== undefined).map(([k, x]) => [k, dropNulls(x)]));
  return v;
};

// ─── Python's own formatting, where a message or a number must match it ─────

/** Python's repr() of a string, as the backend's messages quote names. */
export const pyRepr = (s: string) => {
  const body = s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
  if (s.includes("'") && !s.includes('"')) return `"${body}"`;
  return `'${body.replace(/'/g, "\\'")}'`;
};

/** A double as an exact fraction n / 2^k (k ≥ 0) or n * 2^k, in BigInt. */
const exact = (x: number): { n: bigint; d: bigint } => {
  const buf = new DataView(new ArrayBuffer(8));
  buf.setFloat64(0, x);
  const hi = buf.getUint32(0);
  const lo = buf.getUint32(4);
  const sign = hi >>> 31 ? -1n : 1n;
  const exp = (hi >>> 20) & 0x7ff;
  const mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  const m = exp === 0 ? mant : mant | (1n << 52n);
  const e = (exp === 0 ? 1 : exp) - 1075;
  return e >= 0 ? { n: sign * (m << BigInt(e)), d: 1n } : { n: sign * m, d: 1n << BigInt(-e) };
};

/** Python's round(x, places): the exact value, halves to even. */
export const pyRound = (x: number, places: number) => {
  if (!Number.isFinite(x) || x === 0) return x;
  const { n, d } = exact(x);
  const scale = 10n ** BigInt(places);
  const num = n * scale;
  const neg = num < 0n;
  const a = neg ? -num : num;
  let q = a / d;
  const r = a % d;
  if (r * 2n > d || (r * 2n === d && q % 2n === 1n)) q += 1n;
  const v = Number(q) / Number(scale);
  const out = neg ? -v : v;
  return Number(out.toFixed(places));
};
