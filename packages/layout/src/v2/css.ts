import type { FillV2, LayerV2, LayoutV2, Quad, ShadowV2 } from "./schema";
import { shadowsOf } from "./schema";

/**
 * The small things both builders write the same way (the backend's
 * `layout_v2/build.py`, "Small things"): numbers, escaping, colours, fills,
 * shadows and corner radii.
 */

/** A number as the page writes it: half up to 3 decimals, no trailing zeros, never "-0". */
export const num = (v: number): string => {
  const r = Math.floor(v * 1000 + 0.5) / 1000;
  return r === 0 ? "0" : String(r);
};

/** Python's `format(v, "g")` for the numbers a page or a message prints (6 significant digits, no trailing zeros). */
export const gFmt = (v: number): string => {
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 1e-4 && abs < 1e6) return String(Number(v.toPrecision(6)));
  const [m, e] = v.toExponential(5).split("e") as [string, string];
  const mant = m.replace(/\.?0+$/, "");
  const exp = Number(e);
  return `${mant}e${exp < 0 ? "-" : "+"}${String(Math.abs(exp)).padStart(2, "0")}`;
};

/** Python's `format(v, ".6f")`. */
export const f6 = (v: number) => v.toFixed(6);

/** HTML-escaped as Python's html.escape(text, quote=True): & < > " '. */
export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

/** The brand colours a layout's references resolve to (the context's `colors`). */
export type Colors = {
  primary: string;
  secondary: string;
  ticketType: string;
};

export const DEFAULT_COLORS: Colors = { primary: "#1F3BD8", secondary: "#FF8A3D", ticketType: "#1F3BD8" };

/** Colours, fills and shadows for one layout and context. */
export class Paint {
  readonly accent: string;
  constructor(
    layout: Pick<LayoutV2, "vars">,
    readonly colors: Readonly<Record<string, string | undefined>> = DEFAULT_COLORS,
  ) {
    this.accent = layout.vars.accent || "#000000";
  }

  /** A layout colour as CSS: var:accent is vars.accent (#000000 unset), brand refs the context's, hex upper case. */
  color(ref: string): string {
    if (ref === "var:accent") return this.accent;
    if (ref === "brand.primary") return (this.colors.primary ?? "#000000").toUpperCase();
    if (ref === "brand.secondary") return (this.colors.secondary ?? "#000000").toUpperCase();
    if (ref === "ticket_type") return (this.colors.ticketType ?? this.colors.primary ?? "#000000").toUpperCase();
    return ref.toUpperCase();
  }

  stops(stops: readonly { offset: number; color: string }[]): string {
    return stops.map((s) => `${this.color(s.color)} ${num(s.offset * 100)}%`).join(", ");
  }

  /** A fill as a CSS background value. */
  fill(f: FillV2): string {
    switch (f.type) {
      case "solid":
        return this.color(f.color);
      case "linear":
        return `linear-gradient(${num(f.angle)}deg, ${this.stops(f.stops)})`;
      case "radial":
        return `radial-gradient(circle at ${num(f.cx * 100)}% ${num(f.cy * 100)}%, ${this.stops(f.stops)})`;
    }
  }

  /** Shadows as box-shadow (inset first when inset), or as text-shadow (no spread, no inset), joined with ", ". */
  shadows(layer: Pick<LayerV2, "shadow">, text = false): string {
    return shadowsOf(layer)
      .map((s: ShadowV2) =>
        text
          ? `${num(s.x)}px ${num(s.y)}px ${num(s.blur)}px ${this.color(s.color)}`
          : `${s.inset ? "inset " : ""}${num(s.x)}px ${num(s.y)}px ${num(s.blur)}px ${num(s.spread)}px ${this.color(s.color)}`,
      )
      .join(", ");
  }

  /** Shadows as a CSS filter of drop-shadows (inset ones have none), joined with " ". A drop-shadow's length is the blur's standard deviation: half a box-shadow's blur. */
  dropShadows(layer: Pick<LayerV2, "shadow">): string {
    return shadowsOf(layer)
      .filter((s) => !s.inset)
      .map((s) => `drop-shadow(${num(s.x)}px ${num(s.y)}px ${num(s.blur / 2)}px ${this.color(s.color)})`)
      .join(" ");
  }
}

/** Four corner radii as CSS: none when all are 0, one value when all are equal. */
export const radiusCss = (r: Quad): string | null => {
  if (!r.some(Boolean)) return null;
  if (new Set(r).size === 1) return `${num(r[0])}px`;
  return r.map((x) => `${num(x)}px`).join(" ");
};

/** CSS's rule for corner radii: when two corners on a side ask for more than the side, all four shrink by the same factor. */
export const clampRadii = (radii: Quad, w: number, h: number): Quad => {
  const r = radii.map((v) => Math.max(0, v)) as Quad;
  const sides: [number, number][] = [[r[0] + r[1], w], [r[1] + r[2], h], [r[2] + r[3], w], [r[3] + r[0], h]];
  const f = Math.min(...sides.filter(([total]) => total > 0).map(([total, length]) => length / total), 1);
  return f < 1 ? (r.map((v) => v * f) as Quad) : r;
};

/** A rectangle with four corner radii as an SVG path, the radii clamped as CSS clamps them. */
export const roundedRectPath = (x: number, y: number, w: number, h: number, r: Quad): string => {
  const [tl, tr, br, bl] = clampRadii(r, w, h);
  return (
    `M${num(x + tl)} ${num(y)}H${num(x + w - tr)}` +
    (tr ? `A${num(tr)} ${num(tr)} 0 0 1 ${num(x + w)} ${num(y + tr)}` : "") +
    `V${num(y + h - br)}` +
    (br ? `A${num(br)} ${num(br)} 0 0 1 ${num(x + w - br)} ${num(y + h)}` : "") +
    `H${num(x + bl)}` +
    (bl ? `A${num(bl)} ${num(bl)} 0 0 1 ${num(x)} ${num(y + h - bl)}` : "") +
    `V${num(y + tl)}` +
    (tl ? `A${num(tl)} ${num(tl)} 0 0 1 ${num(x + tl)} ${num(y)}` : "") +
    "Z"
  );
};

/** The two ends of a CSS linear gradient's line at `angle` in a w × h box (SVG userSpaceOnUse). */
export const linearEnds = (angle: number, w: number, h: number) => {
  // As Python's math.radians: the angle times (pi / 180).
  const a = angle * (Math.PI / 180);
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  const cx = w / 2;
  const cy = h / 2;
  return { x1: cx - dx * half, y1: cy - dy * half, x2: cx + dx * half, y2: cy + dy * half };
};

/** A CSS `circle` gradient's radius at (cx, cy) in a w × h box: to the farthest corner. */
export const farthestCorner = (cx: number, cy: number, w: number, h: number) =>
  Math.max(...[0, w].flatMap((px) => [0, h].map((py) => Math.hypot(cx - px, cy - py))));
