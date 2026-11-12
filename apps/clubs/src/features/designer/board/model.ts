import { type ColorV2, type FillV2, type LayerKindV2, type LayerV2, type LayoutV2, layerV2, shadowsOf } from "@moa/layout";

/**
 * Making and changing layers on the board, the way the inspector and the
 * shortcuts do: new layers with sensible sizes for the canvas, copies with
 * fresh ids, and the colours a layer paints with (for the accent count).
 */

const ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

/** A fresh layer id, unique on this layout: `text-4k2p9z`. */
export const freshId = (kind: string, taken: ReadonlySet<string>) => {
  for (;;) {
    let s = "";
    for (let i = 0; i < 6; i++) s += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
    const id = `${kind}-${s}`;
    if (!taken.has(id)) return id;
  }
};

export const KIND_NAME: Record<LayerKindV2, string> = {
  text: "Text",
  shape: "Shape",
  svg: "Artwork",
  image: "Image",
  qr: "QR code",
};

export type NewLayer = { kind: "text" } | { kind: "shape"; shape: "rect" | "ellipse" } | { kind: "image"; source: "upload" | "org_logo" | "guest_photo" } | { kind: "qr" } | { kind: "svg"; markup: string; name?: string; width?: number; height?: number };

/** A new layer of a kind, placed and sized for the canvas, every default filled. */
export const newLayer = (spec: NewLayer, layout: LayoutV2): LayerV2 => {
  const { width: W, height: H } = layout.canvas;
  const taken = new Set(layout.layers.map((l) => l.id));
  const short = Math.min(W, H);
  const round = (n: number) => Math.round(n);
  switch (spec.kind) {
    case "text": {
      const size = Math.max(12, round(H * 0.06));
      return layerV2({
        kind: "text",
        id: freshId("text", taken),
        name: "Text",
        x: round(W * 0.08),
        y: round(H * 0.4),
        width: round(W * 0.5),
        height: round(size * 1.4),
        text: "{{attendee_name}}",
        font: { family: "Inter", weight: 600, style: "normal" },
        size,
        color: "#141614",
      });
    }
    case "shape":
      return layerV2({
        kind: "shape",
        id: freshId("shape", taken),
        name: spec.shape === "ellipse" ? "Circle" : "Rectangle",
        shape: spec.shape,
        x: round(W * 0.1),
        y: round(H * 0.1),
        width: round(short * 0.3),
        height: round(short * (spec.shape === "ellipse" ? 0.3 : 0.18)),
        fill: { type: "solid", color: "var:accent" },
      });
    case "image":
      return layerV2({
        kind: "image",
        id: freshId("image", taken),
        name: spec.source === "org_logo" ? "Club logo" : spec.source === "guest_photo" ? "Guest photo" : "Image",
        source: spec.source,
        x: round(W * 0.08),
        y: round(H * 0.08),
        width: round(short * 0.22),
        height: round(short * 0.22),
        fit: spec.source === "guest_photo" ? "cover" : "contain",
        // A guest with no photo still gets a tile with their initials.
        placeholder: spec.source === "guest_photo" ? "initials" : "none",
      });
    case "qr": {
      const size = round(short * 0.3);
      return layerV2({
        kind: "qr",
        id: taken.has("qr") ? freshId("qr", taken) : "qr",
        name: "QR code",
        x: round(W - size - W * 0.06),
        y: round((H - size) / 2),
        width: size,
        height: size,
        // A blank border, so it scans on any background.
        quietZone: 2,
      });
    }
    case "svg":
      return layerV2({
        kind: "svg",
        id: freshId("svg", taken),
        name: spec.name ?? "Artwork",
        markup: spec.markup,
        x: round(W * 0.1),
        y: round(H * 0.1),
        width: spec.width ?? round(short * 0.3),
        height: spec.height ?? round(short * 0.3),
      });
  }
};

/** Copies of layers, with fresh ids and names, nudged so they do not sit exactly on the originals. */
export const copiesOf = (layers: readonly LayerV2[], layout: LayoutV2, offset = 12): LayerV2[] => {
  const taken = new Set(layout.layers.map((l) => l.id));
  return layers.map((l) => {
    const id = freshId(l.kind, taken);
    taken.add(id);
    return { ...structuredClone(l), id, name: l.name.endsWith(" copy") ? l.name : `${l.name} copy`.slice(0, 60), x: l.x + offset, y: l.y + offset, locked: false } as LayerV2;
  });
};

/** Every colour a layer paints with. */
export const colorsOf = (l: LayerV2): ColorV2[] => {
  const out: ColorV2[] = [];
  const fill = (f: FillV2 | null | undefined) => {
    if (!f) return;
    if (f.type === "solid") out.push(f.color);
    else out.push(...f.stops.map((s) => s.color));
  };
  out.push(...shadowsOf(l).map((s) => s.color));
  switch (l.kind) {
    case "text":
      out.push(l.color);
      fill(l.background);
      break;
    case "shape":
      fill(l.fill);
      if (l.stroke) out.push(l.stroke.color);
      break;
    case "svg":
      out.push(...Object.values(l.recolor ?? {}));
      break;
    case "image":
      if (l.border) out.push(l.border.color);
      break;
    case "qr":
      fill(l.background);
      break;
  }
  return out;
};

/** The layers the accent colour paints: what the accent recolours. */
export const accentLayers = (layout: LayoutV2) => layout.layers.filter((l) => colorsOf(l).includes("var:accent"));

/** The colours written in an SVG's markup, upper-cased and in the order they first appear: what recolour can change. */
export const svgColors = (markup: string): string[] => {
  const found = new Set<string>();
  for (const m of markup.matchAll(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) {
    const hex = m[0].length === 4 ? `#${[...m[0].slice(1)].map((c) => c + c).join("")}` : m[0];
    found.add(hex.toUpperCase());
  }
  return [...found];
};

/** Patch one layer of a layout. */
export const patchLayer = (layout: LayoutV2, id: string, patch: Partial<LayerV2>): LayoutV2 => ({
  ...layout,
  layers: layout.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as LayerV2) : l)),
});

/** Patch several layers of a layout, each with its own patch. */
export const patchLayers = (layout: LayoutV2, patches: ReadonlyMap<string, Partial<LayerV2>>): LayoutV2 =>
  patches.size ? { ...layout, layers: layout.layers.map((l) => (patches.has(l.id) ? ({ ...l, ...patches.get(l.id) } as LayerV2) : l)) } : layout;
