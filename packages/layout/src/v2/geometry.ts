import type { LayerV2 } from "./schema";

/**
 * Geometry for the editor's board: boxes, rotation, hit testing, snapping,
 * align and distribute. All in canvas px, y down; a rotation turns a box
 * clockwise about its centre, as CSS `rotate()` with `transform-origin:
 * center` draws it. Nothing here touches the DOM, so dragging needs no
 * layout pass and no server.
 */

export interface Point {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Box extends Rect {
  rotation: number;
}
type Boxed = { x: number; y: number; width: number; height: number; rotation?: number };

/** A layer's box: position, size and rotation. */
export const layerBox = (l: Boxed): Box => ({ x: l.x, y: l.y, width: l.width, height: l.height, rotation: l.rotation ?? 0 });

export const centerOf = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

const rad = (deg: number) => (deg * Math.PI) / 180;

/** `p` turned by `deg` (clockwise on screen) about `c`. */
export const rotatePoint = (p: Point, c: Point, deg: number): Point => {
  if (!deg) return { ...p };
  const a = rad(deg);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
};

/** The four corners as drawn: top-left, top-right, bottom-right, bottom-left. */
export const boxCorners = (b: Box): [Point, Point, Point, Point] => {
  const c = centerOf(b);
  const pts: [Point, Point, Point, Point] = [
    { x: b.x, y: b.y },
    { x: b.x + b.width, y: b.y },
    { x: b.x + b.width, y: b.y + b.height },
    { x: b.x, y: b.y + b.height },
  ];
  return pts.map((p) => rotatePoint(p, c, b.rotation)) as [Point, Point, Point, Point];
};

/** The axis-aligned rectangle round a box as drawn (rotation included). */
export const rotatedBounds = (b: Boxed): Rect => {
  const box = layerBox(b);
  if (!box.rotation) return { x: box.x, y: box.y, width: box.width, height: box.height };
  const pts = boxCorners(box);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
};

/** The rectangle round several boxes; null for none. */
export const unionBounds = (rects: readonly Rect[]): Rect | null => {
  if (!rects.length) return null;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { x, y, width: right - x, height: bottom - y };
};

/** Whether a point is inside a box as drawn (its rotation undone first). `slop` widens it on every side. */
export const pointInBox = (p: Point, b: Box, slop = 0) => {
  const q = rotatePoint(p, centerOf(b), -b.rotation);
  return q.x >= b.x - slop && q.x <= b.x + b.width + slop && q.y >= b.y - slop && q.y <= b.y + b.height + slop;
};

export interface HitOptions {
  /** Hidden layers are skipped unless this is set. */
  includeHidden?: boolean;
  /** Locked layers are skipped when this is false (they are hit by default, so a click selects them in the list). */
  includeLocked?: boolean;
  /** Extra px round each box, for thin lines. */
  slop?: number;
}

/** The topmost layer under a point (the last in paint order), or null. */
export const hitTest = <L extends LayerV2>(layers: readonly L[], p: Point, opts: HitOptions = {}): L | null => {
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i]!;
    if (l.hidden && !opts.includeHidden) continue;
    if (l.locked && opts.includeLocked === false) continue;
    if (pointInBox(p, layerBox(l), opts.slop ?? 0)) return l;
  }
  return null;
};

/** Every layer under a point, topmost first. */
export const hitTestAll = <L extends LayerV2>(layers: readonly L[], p: Point, opts: HitOptions = {}): L[] =>
  [...layers].reverse().filter((l) => (opts.includeHidden || !l.hidden) && !(l.locked && opts.includeLocked === false) && pointInBox(p, layerBox(l), opts.slop ?? 0));

const intersects = (a: Rect, b: Rect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const contains = (outer: Rect, inner: Rect) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

/** A marquee's layers: those whose drawn bounds it touches (or, with `whole`, holds entirely). Unlocked and visible only. */
export const layersInRect = <L extends LayerV2>(layers: readonly L[], marquee: Rect, whole = false): L[] => {
  const m = normalizeRect(marquee);
  return layers.filter((l) => !l.hidden && !l.locked && (whole ? contains(m, rotatedBounds(l)) : intersects(m, rotatedBounds(l))));
};

/** A rectangle dragged in any direction, with a positive width and height. */
export const normalizeRect = (r: Rect): Rect => ({
  x: Math.min(r.x, r.x + r.width),
  y: Math.min(r.y, r.y + r.height),
  width: Math.abs(r.width),
  height: Math.abs(r.height),
});

// ─── Snapping ───────────────────────────────────────────────────────────────

export type SnapAxis = "x" | "y";
export type SnapKind = "start" | "center" | "end";

/** One line something can snap to: a canvas edge or centre, or another layer's edge or centre. */
export interface SnapLine {
  axis: SnapAxis;
  /** Where the line is: an x for axis "x", a y for axis "y". */
  at: number;
  kind: SnapKind;
  /** "canvas" or the layer's id. */
  source: string;
  /** The extent along the line of what it came from, for drawing a guide. */
  from: number;
  to: number;
}

/**
 * The lines to snap to: the canvas's edges and centre lines, and every
 * other visible layer's drawn edges and centres. `exclude` is the layers
 * being moved.
 */
export const snapCandidates = (canvas: { width: number; height: number }, layers: readonly LayerV2[], exclude: Iterable<string> = []): SnapLine[] => {
  const skip = new Set(exclude);
  const W = canvas.width;
  const H = canvas.height;
  const out: SnapLine[] = [
    { axis: "x", at: 0, kind: "start", source: "canvas", from: 0, to: H },
    { axis: "x", at: W / 2, kind: "center", source: "canvas", from: 0, to: H },
    { axis: "x", at: W, kind: "end", source: "canvas", from: 0, to: H },
    { axis: "y", at: 0, kind: "start", source: "canvas", from: 0, to: W },
    { axis: "y", at: H / 2, kind: "center", source: "canvas", from: 0, to: W },
    { axis: "y", at: H, kind: "end", source: "canvas", from: 0, to: W },
  ];
  for (const l of layers) {
    if (l.hidden || skip.has(l.id)) continue;
    const b = rotatedBounds(l);
    const right = b.x + b.width;
    const bottom = b.y + b.height;
    out.push(
      { axis: "x", at: b.x, kind: "start", source: l.id, from: b.y, to: bottom },
      { axis: "x", at: b.x + b.width / 2, kind: "center", source: l.id, from: b.y, to: bottom },
      { axis: "x", at: right, kind: "end", source: l.id, from: b.y, to: bottom },
      { axis: "y", at: b.y, kind: "start", source: l.id, from: b.x, to: right },
      { axis: "y", at: b.y + b.height / 2, kind: "center", source: l.id, from: b.x, to: right },
      { axis: "y", at: bottom, kind: "end", source: l.id, from: b.x, to: right },
    );
  }
  return out;
};

/** A guide to draw while snapped: the line, spanning both what moved and what it met. */
export interface SnapGuide {
  axis: SnapAxis;
  at: number;
  from: number;
  to: number;
  source: string;
}

export interface SnapResult {
  /** How far to move the rectangle so it sits on the lines found. */
  dx: number;
  dy: number;
  guides: SnapGuide[];
}

const edgesOf = (r: Rect, axis: SnapAxis): [number, number, number] =>
  axis === "x" ? [r.x, r.x + r.width / 2, r.x + r.width] : [r.y, r.y + r.height / 2, r.y + r.height];

const snapAxis = (r: Rect, lines: readonly SnapLine[], axis: SnapAxis, threshold: number) => {
  const mine = edgesOf(r, axis);
  let best: { d: number; line: SnapLine } | null = null;
  for (const line of lines) {
    if (line.axis !== axis) continue;
    for (const v of mine) {
      const d = line.at - v;
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, line };
    }
  }
  if (!best) return { d: 0, guides: [] as SnapGuide[] };
  const d = best.d;
  // Every line the moved rectangle now sits on, at the same offset: one guide each.
  const moved = edgesOf(axis === "x" ? { ...r, x: r.x + d } : { ...r, y: r.y + d }, axis);
  const span: [number, number] = axis === "x" ? [r.y, r.y + r.height] : [r.x, r.x + r.width];
  const guides = lines
    .filter((l) => l.axis === axis && moved.some((v) => Math.abs(l.at - v) < 1e-6))
    .map((l) => ({ axis, at: l.at, from: Math.min(l.from, span[0]), to: Math.max(l.to, span[1]), source: l.source }));
  return { d, guides };
};

/**
 * Snap a moving rectangle (the drawn bounds of what is dragged) to the
 * nearest line on each axis within `threshold` px -- its left, centre or
 * right to an x line; its top, middle or bottom to a y line.
 */
export const snapRect = (r: Rect, lines: readonly SnapLine[], threshold = 6): SnapResult => {
  const x = snapAxis(r, lines, "x", threshold);
  const y = snapAxis(r, lines, "y", threshold);
  return { dx: x.d, dy: y.d, guides: [...x.guides, ...y.guides] };
};

/** Snap one value (a resize handle's edge) to the nearest line on an axis within `threshold`; the value itself when none. */
export const snapValue = (v: number, lines: readonly SnapLine[], axis: SnapAxis, threshold = 6): { value: number; line: SnapLine | null } => {
  let best: SnapLine | null = null;
  for (const l of lines) if (l.axis === axis && Math.abs(l.at - v) <= threshold && (!best || Math.abs(l.at - v) < Math.abs(best.at - v))) best = l;
  return { value: best ? best.at : v, line: best };
};

// ─── Align and distribute ───────────────────────────────────────────────────

export type AlignEdge = "left" | "center" | "right" | "top" | "middle" | "bottom";

/** A move to apply to one layer. */
export interface Move {
  id: string;
  x: number;
  y: number;
}

/**
 * Line layers up by their drawn bounds: to the selection's own bounds, or to
 * the canvas (`to`), which is also what one layer alone aligns to.
 */
export const alignLayers = (layers: readonly LayerV2[], ids: readonly string[], edge: AlignEdge, opts: { to?: "selection" | "canvas"; canvas?: { width: number; height: number } } = {}): Move[] => {
  const chosen = layers.filter((l) => ids.includes(l.id) && !l.locked);
  if (!chosen.length) return [];
  const bounds = chosen.map((l) => ({ l, b: rotatedBounds(l) }));
  const useCanvas = opts.to === "canvas" || (chosen.length === 1 && opts.canvas);
  const target: Rect = useCanvas && opts.canvas ? { x: 0, y: 0, width: opts.canvas.width, height: opts.canvas.height } : unionBounds(bounds.map((x) => x.b))!;
  return bounds.map(({ l, b }) => {
    let dx = 0;
    let dy = 0;
    if (edge === "left") dx = target.x - b.x;
    if (edge === "center") dx = target.x + target.width / 2 - (b.x + b.width / 2);
    if (edge === "right") dx = target.x + target.width - (b.x + b.width);
    if (edge === "top") dy = target.y - b.y;
    if (edge === "middle") dy = target.y + target.height / 2 - (b.y + b.height / 2);
    if (edge === "bottom") dy = target.y + target.height - (b.y + b.height);
    return { id: l.id, x: l.x + dx, y: l.y + dy };
  });
};

/**
 * Even gaps between three or more layers, by their drawn bounds, in their
 * order along the axis: the first and last stay where they are.
 */
export const distributeLayers = (layers: readonly LayerV2[], ids: readonly string[], axis: "horizontal" | "vertical"): Move[] => {
  const chosen = layers.filter((l) => ids.includes(l.id) && !l.locked).map((l) => ({ l, b: rotatedBounds(l) }));
  if (chosen.length < 3) return [];
  const h = axis === "horizontal";
  const start = (b: Rect) => (h ? b.x : b.y);
  const size = (b: Rect) => (h ? b.width : b.height);
  chosen.sort((a, b) => start(a.b) - start(b.b) || a.l.id.localeCompare(b.l.id));
  const first = chosen[0]!.b;
  const last = chosen[chosen.length - 1]!.b;
  const span = start(last) + size(last) - start(first);
  const total = chosen.reduce((n, c) => n + size(c.b), 0);
  const gap = (span - total) / (chosen.length - 1);
  let cursor = start(first);
  return chosen.map(({ l, b }) => {
    const d = cursor - start(b);
    cursor += size(b) + gap;
    return { id: l.id, x: h ? l.x + d : l.x, y: h ? l.y : l.y + d };
  });
};

// ─── Resizing a rotated box ─────────────────────────────────────────────────

export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/**
 * A box resized by dragging a handle to a point (canvas px), its rotation
 * kept: the opposite edge or corner stays where it is on screen. With
 * `keepRatio` (shift) a corner keeps the box's proportions. Sizes stop at
 * `min` px.
 */
export const resizeBox = (b: Box, handle: Handle, p: Point, opts: { keepRatio?: boolean; min?: number } = {}): Box => {
  const min = opts.min ?? 1;
  const c = centerOf(b);
  // Work in the box's own frame: rotation undone about its centre.
  const q = rotatePoint(p, c, -b.rotation);
  let left = b.x;
  let top = b.y;
  let right = b.x + b.width;
  let bottom = b.y + b.height;
  if (handle.includes("w")) left = Math.min(q.x, right - min);
  if (handle.includes("e")) right = Math.max(q.x, left + min);
  if (handle.includes("n")) top = Math.min(q.y, bottom - min);
  if (handle.includes("s")) bottom = Math.max(q.y, top + min);
  if (opts.keepRatio && handle.length === 2 && b.width > 0 && b.height > 0) {
    const ratio = b.width / b.height;
    const w = right - left;
    const h = bottom - top;
    if (w / h > ratio) {
      const nh = w / ratio;
      if (handle.includes("n")) top = bottom - nh;
      else bottom = top + nh;
    } else {
      const nw = h * ratio;
      if (handle.includes("w")) left = right - nw;
      else right = left + nw;
    }
  }
  const w = right - left;
  const h = bottom - top;
  // The fixed point (the opposite corner or edge middle) must not move on screen.
  const ax = handle.includes("w") ? b.x + b.width : handle.includes("e") ? b.x : b.x + b.width / 2;
  const ay = handle.includes("n") ? b.y + b.height : handle.includes("s") ? b.y : b.y + b.height / 2;
  const anchorBefore = rotatePoint({ x: ax, y: ay }, c, b.rotation);
  const nax = handle.includes("w") ? right : handle.includes("e") ? left : left + w / 2;
  const nay = handle.includes("n") ? bottom : handle.includes("s") ? top : top + h / 2;
  const nc = { x: left + w / 2, y: top + h / 2 };
  const anchorAfter = rotatePoint({ x: nax, y: nay }, nc, b.rotation);
  return { x: left + anchorBefore.x - anchorAfter.x, y: top + anchorBefore.y - anchorAfter.y, width: w, height: h, rotation: b.rotation };
};

/** The rotation that points a box's top at `p` (the rotate handle), snapped to `step` degrees when given. */
export const rotationTo = (b: Rect, p: Point, step?: number) => {
  const c = centerOf(b);
  let deg = (Math.atan2(p.x - c.x, -(p.y - c.y)) * 180) / Math.PI;
  if (step) deg = Math.round(deg / step) * step;
  if (deg > 180) deg -= 360;
  if (deg <= -180) deg += 360;
  return deg === 0 ? 0 : deg;
};
