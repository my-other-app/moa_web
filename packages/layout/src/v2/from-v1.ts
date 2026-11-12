import { FONT_METRICS, fontFileOf, fontWeightOf, LINE_HEIGHT, TICKET_FONTS } from "../fonts";
import { scaleShapePath, SHAPE_PATH_BOX, type TicketLayer, TicketLayoutFields, ticketArea } from "../ticket-layout";
import { V1_FONT_FAMILY } from "./fonts";
import { LayoutV2, type LayoutV2Input, V2_LIMITS } from "./schema";

/**
 * A saved v1 layout as v2, mechanically (contract V4): what the editor
 * opens a v1 design as. The ticket area becomes the canvas (the artboard
 * round it was never printed), a template image becomes the bottom layer,
 * the v1 font keys become their CSS families, and a canvas outside 300 to
 * 3000 px is scaled into that range with everything on it.
 *
 * Text: v1 places the first baseline at the layer's top plus the font's
 * ascent; CSS adds half the leading above it, so the box moves up by that
 * half-leading. Line spacing (extra px) becomes a unitless line height,
 * letter spacing (px) becomes em, "truncate" becomes "ellipsis", and shrink
 * keeps v1's floor of half the size. Agenda layers have no v2 kind and are
 * left out. A shape outline drawn in v1's 1000 × 1000 box is rescaled to the
 * layer's own px.
 */

const round = (v: number, places = 3) => {
  const f = 10 ** places;
  return Math.floor(v * f + 0.5) / f;
};

/** How much a v1 canvas (its ticket area) is scaled to fit v2's 300–3000 px. */
export const v1Scale = (w: number, h: number) => {
  const { canvasMin: lo, canvasMax: hi } = V2_LIMITS;
  if (Math.max(w, h) > hi) return hi / Math.max(w, h);
  if (Math.min(w, h) < lo) return Math.min(lo / Math.min(w, h), hi / Math.max(w, h));
  return 1;
};

/** Text-only v1 layers: what the v1 box's first baseline sits under, in CSS terms. */
const halfLeading = (font: keyof typeof TICKET_FONTS, weight: number, size: number, lineHeightPx: number) => {
  const m = FONT_METRICS[fontFileOf(font, weight)] ?? { unitsPerEm: 1000, ascent: 950, descent: -250 };
  return (lineHeightPx - ((m.ascent - m.descent) / m.unitsPerEm) * size) / 2;
};

const convertLayer = (l: TicketLayer, dx: number, dy: number, s: number): Record<string, unknown> | null => {
  const common = {
    id: l.id,
    name: l.name,
    x: round((l.x - dx) * s),
    y: round((l.y - dy) * s),
    hidden: l.hidden,
    locked: l.locked,
    preprinted: l.preprinted,
    rotation: 0,
    showIf: null,
    shadow: null,
  };
  switch (l.kind) {
    case "text": {
      const weight = fontWeightOf(l.font, l.weight);
      const advance = l.size * LINE_HEIGHT + l.lineSpacing;
      const lineHeight = Math.min(5, Math.max(0.5, advance / l.size));
      const lineHeightPx = lineHeight * l.size;
      return {
        ...common,
        kind: "text",
        y: round((l.y - dy - halfLeading(l.font, weight, l.size, lineHeightPx)) * s),
        width: round(l.width * s),
        height: round(lineHeightPx * l.maxLines * s),
        opacity: l.opacity,
        text: l.text,
        font: { family: V1_FONT_FAMILY[l.font], weight, style: "normal" },
        size: round(l.size * s),
        color: l.color,
        letterSpacing: round(Math.min(5, Math.max(-1, l.letterSpacing / l.size)), 4),
        lineHeight: round(lineHeight, 4),
        align: l.align,
        valign: "top",
        transform: "none",
        maxLines: Math.min(20, l.maxLines),
        fit: l.fit === "truncate" ? "ellipsis" : "shrink",
        minSize: Math.max(1, round((l.fit === "truncate" ? l.size : l.size * 0.5) * s)),
        background: null,
        padding: [0, 0, 0, 0],
        radius: [0, 0, 0, 0],
      };
    }
    case "qr":
      return {
        ...common,
        kind: "qr",
        width: round(l.size * s),
        height: round(l.size * s),
        opacity: 1,
        dark: "#000000",
        light: "#FFFFFF",
        quietZone: l.quietZone,
        background: null,
        radius: [0, 0, 0, 0],
      };
    case "image": {
      const r = round(l.radius * s);
      return {
        ...common,
        kind: "image",
        width: round(l.width * s),
        height: round(l.height * s),
        opacity: l.opacity,
        source: l.source,
        imageKey: l.imageKey,
        fit: l.fit,
        radius: [r, r, r, r],
        border: null,
        placeholder: "initials",
      };
    }
    case "shape": {
      const r = round(l.radius * s);
      const stroke = l.stroke && l.strokeWidth > 0 ? { color: l.stroke, width: round(l.strokeWidth * s), dash: null } : null;
      return {
        ...common,
        kind: "shape",
        width: round(l.width * s),
        height: round(l.height * s),
        opacity: l.opacity,
        shape: l.path ? "path" : "rect",
        path: l.path ? scaleShapePath(l.path, (l.width * s) / SHAPE_PATH_BOX, (l.height * s) / SHAPE_PATH_BOX) : null,
        fill: l.fill ? { type: "solid", color: l.fill } : null,
        stroke,
        radius: [r, r, r, r],
      };
    }
    case "agenda":
      return null;
  }
};

/** A v1 layout (as saved, defaults may be missing) as a v2 layout. */
export const fromV1 = (v1: unknown, opts: { accent?: string } = {}): LayoutV2 => {
  const src = TicketLayoutFields.parse(v1);
  const area = ticketArea(src.canvas);
  const s = v1Scale(area.width, area.height);
  const widthMm = src.page.widthMm;
  const heightMm = src.page.heightMm ?? round((widthMm * area.height) / area.width);
  const layers: Record<string, unknown>[] = [];
  if (src.canvas.templateKey) {
    layers.push({
      kind: "image",
      id: src.layers.some((l) => l.id === "template") ? "v1-template" : "template",
      name: "Template",
      x: round(-area.x * s),
      y: round(-area.y * s),
      width: round(src.canvas.width * s),
      height: round(src.canvas.height * s),
      source: "upload",
      imageKey: src.canvas.templateKey,
      fit: "cover",
      preprinted: src.canvas.templatePreprinted,
      locked: true,
    });
  }
  for (const l of src.layers) {
    const c = convertLayer(l, area.x, area.y, s);
    if (c) layers.push(c);
  }
  const out: LayoutV2Input = {
    version: 2,
    page: { widthMm, heightMm },
    canvas: { width: round(area.width * s), height: round(area.height * s), background: { type: "solid", color: src.canvas.background } },
    vars: opts.accent ? { accent: opts.accent } : {},
    layers: layers as never,
  };
  return LayoutV2.parse(out) as LayoutV2;
};
