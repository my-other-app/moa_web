import { FONT_METRICS, fontFileOf, fontWeightOf, type TicketFont } from "../fonts";
import { TicketLayoutFields, ticketArea } from "../ticket-layout";
import { TICKET_TOKENS } from "../ticket-tokens";
import { DOC_FONTS, findFont, nearestFace, V1_FONT_FAMILY } from "./fonts";
import { LayoutV2, pyRound, V2_LIMITS } from "./schema";
import { DESIGN_TOKENS } from "./tokens";

/**
 * A saved v1 layout as v2, mechanically (contract V4): the backend's
 * `layout_v2/convert.py from_v1`, step for step. The ticket area becomes the
 * canvas, every layer keeps its place, the five v1 fonts become their CSS
 * families, a text's first baseline stays where reportlab put it, a shape's
 * outline (drawn in a 1000 x 1000 box) is scaled to the layer's pixels, and
 * the template image (if any) is an image layer at the bottom. A canvas
 * outside 300 to 3000 px is scaled into that range with everything on it. A
 * v1 token spelled with an alias that is now a design's token of another
 * meaning ({{role}}: v1's ticket type, a badge's ATTENDEE/SPEAKER/STAFF) is
 * written as the v1 key it meant. Agenda layouts stay v1 (an error).
 */

/** Ascent and descent per em of the v1 fonts' CSS families, as Chromium lays lines out (OS/2 typo metrics when the font asks, else hhea): read from the lock's TTFs. */
export const V2_FACE_METRICS: Readonly<Record<string, readonly [number, number]>> = {
  "Inter|400": [1984 / 2048, 494 / 2048],
  "Inter|500": [1984 / 2048, 494 / 2048],
  "Inter|600": [1984 / 2048, 494 / 2048],
  "Inter|700": [1984 / 2048, 494 / 2048],
  "Google Sans|400": [966 / 1000, 286 / 1000],
  "Google Sans|500": [966 / 1000, 286 / 1000],
  "Google Sans|600": [966 / 1000, 286 / 1000],
  "Google Sans|700": [966 / 1000, 286 / 1000],
  "Roboto Mono|400": [2146 / 2048, 555 / 2048],
  "Roboto Mono|700": [2146 / 2048, 555 / 2048],
  "DM Serif Display|400": [1036 / 1000, 335 / 1000],
  "Bebas Neue|400": [900 / 1000, 300 / 1000],
};

const v2Metrics = (family: string, weight: number): readonly [number, number] => {
  const font = findFont(family, DOC_FONTS);
  const face = font ? nearestFace(font, weight, "normal") : null;
  return (face && V2_FACE_METRICS[`${family}|${face.weight}`]) || [0.9, 0.25];
};

const v1Metrics = (font: TicketFont, weight: number): [number, number] => {
  const m = FONT_METRICS[fontFileOf(font, weight)] ?? { unitsPerEm: 1000, ascent: 950, descent: -250 };
  return [m.ascent / m.unitsPerEm, -m.descent / m.unitsPerEm];
};

const BY_NAME = new Map<string, string>();
for (const t of TICKET_TOKENS) {
  BY_NAME.set(t.key, t.key);
  for (const a of t.aliases ?? []) BY_NAME.set(a, t.key);
}
const CLASH = new Set(DESIGN_TOKENS.map((t) => t.key));

/** v1 aliases that a design now uses with another meaning, written as their v1 keys. */
export const v1Text = (src: string): string => {
  const fix = (whole: string, open: string, name: string, close: string) => {
    const n = name.toLowerCase();
    const key = BY_NAME.get(n);
    return key && key !== n && CLASH.has(n) ? open + key + close : whole;
  };
  return src
    .replace(/(\{\{\s*)([A-Za-z0-9_.]+)((?:\s*\|[^}]*)?\s*\}\})/g, (m, a: string, b: string, c: string) => fix(m, a, b, c))
    .replace(/(\{%\s*if\s+(?:not\s+)?)(?:\{\{\s*)?([A-Za-z0-9_.]+)(?:\s*\}\})?(\s*%\})/gi, (m, a: string, b: string, c: string) => fix(m, a, b, c));
};

/** How much a v1 canvas (its ticket area) is scaled to fit v2's 300–3000 px. */
export const v1Scale = (w: number, h: number) => {
  const big = Math.max(w, h);
  const small = Math.min(w, h);
  if (big > V2_LIMITS.canvasMax) return V2_LIMITS.canvasMax / big;
  if (small < V2_LIMITS.canvasMin) return Math.min(V2_LIMITS.canvasMin / small, V2_LIMITS.canvasMax / big);
  return 1;
};

/** Python's round(x) for a float: to the nearest integer, halves to even. */
const roundHalfEven = (x: number) => {
  const f = Math.floor(x);
  const d = x - f;
  return d > 0.5 || (d === 0.5 && f % 2 !== 0) ? f + 1 : f;
};

/** Python's str() of a float: "200.0" for a whole number, else the shortest form. */
const pyFloat = (v: number) => (v === 0 ? "0.0" : Number.isInteger(v) ? `${v}.0` : String(v));

/** A v1 outline in the layer's px, every x times sx and y times sy: app.core.layout.model.scale_shape_path, as Python writes it. */
export const scaleV1Path = (path: string, sx: number, sy: number) => {
  let i = 0;
  return path.replace(/-?\d*\.?\d+(?:e-?\d+)?/gi, (n) => {
    const v = Number(n) * (i++ % 2 === 0 ? sx : sy);
    return pyFloat(roundHalfEven(v * 100) / 100);
  });
};

const solid = (c: string | null | undefined) => (c ? { type: "solid", color: c } : null);

/** A v1 layout (as saved: defaults may be missing) as a v2 layout. Throws for a programme (agenda) layout, which stays v1. */
export const fromV1 = (v1Layout: unknown): LayoutV2 => {
  const v1 = TicketLayoutFields.parse(v1Layout);
  if (v1.layers.some((l) => l.kind === "agenda")) throw new Error("a programme (agenda) layout stays a v1 layout");
  const area = ticketArea(v1.canvas);
  const s = v1Scale(area.width, area.height);
  const ox = -area.x;
  const oy = -area.y;
  const X = (v: number) => pyRound((v + ox) * s, 3);
  const Y = (v: number) => pyRound((v + oy) * s, 3);
  const S = (v: number) => pyRound(v * s, 3);
  const widthMm = v1.page.widthMm;
  const heightMm = v1.page.heightMm || pyRound((widthMm * area.height) / area.width, 3);
  const layers: Record<string, unknown>[] = [];
  if (v1.canvas.templateKey)
    layers.push({
      id: "template", name: "Template", kind: "image", source: "upload", imageKey: v1.canvas.templateKey,
      x: X(0), y: Y(0), width: S(v1.canvas.width), height: S(v1.canvas.height), fit: "cover", preprinted: v1.canvas.templatePreprinted,
    });
  for (const l of v1.layers) {
    const base = { id: l.id, name: l.name, kind: l.kind, hidden: l.hidden, locked: l.locked, preprinted: l.preprinted };
    switch (l.kind) {
      case "text": {
        const family = V1_FONT_FAMILY[l.font];
        const weight = fontWeightOf(l.font, l.weight);
        const lh = 1.2 + l.lineSpacing / l.size;
        const [a1] = v1Metrics(l.font, weight);
        const [a2, d2] = v2Metrics(family, weight);
        // The first baseline where reportlab drew it (its ascent below the top).
        const top = l.y + a1 * l.size - ((lh - a2 - d2) / 2 + a2) * l.size;
        layers.push({
          ...base, x: X(l.x), y: Y(top), width: S(l.width), height: S(l.maxLines * lh * l.size),
          text: v1Text(l.text), font: { family, weight }, size: S(l.size), color: l.color,
          letterSpacing: pyRound(l.letterSpacing / l.size, 4), lineHeight: pyRound(lh, 4), align: l.align, maxLines: l.maxLines,
          fit: l.fit === "shrink" ? "shrink" : "ellipsis", minSize: S(l.size * 0.5), opacity: l.opacity,
        });
        break;
      }
      case "qr":
        layers.push({ ...base, x: X(l.x), y: Y(l.y), width: S(l.size), height: S(l.size), quietZone: l.quietZone });
        break;
      case "image": {
        const img: Record<string, unknown> = {
          ...base, x: X(l.x), y: Y(l.y), width: S(l.width), height: S(l.height), source: l.source,
          imageKey: l.imageKey, fit: l.fit, align: l.align, radius: S(l.radius), opacity: l.opacity,
        };
        if (l.source === "guest_photo")
          Object.assign(img, { placeholder: "initials", placeholderStyle: { color: "brand.primary", background: solid("#E9ECF2"), family: "Inter", weight: 700 } });
        layers.push(img);
        break;
      }
      case "shape": {
        const shape: Record<string, unknown> = {
          ...base, x: X(l.x), y: Y(l.y), width: S(l.width), height: S(l.height), opacity: l.opacity, fill: solid(l.fill), radius: S(l.radius),
        };
        if (l.stroke && l.strokeWidth > 0) shape.stroke = { color: l.stroke, width: S(l.strokeWidth) };
        if (l.path) Object.assign(shape, { shape: "path", path: scaleV1Path(l.path, S(l.width) / 1000, S(l.height) / 1000) });
        else shape.shape = "rect";
        layers.push(shape);
        break;
      }
    }
  }
  return LayoutV2.parse({
    version: 2,
    page: { widthMm, heightMm },
    canvas: { width: S(area.width), height: S(area.height), background: solid(v1.canvas.background) },
    layers,
  }) as LayoutV2;
};
