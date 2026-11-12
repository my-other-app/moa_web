/**
 * The board's arithmetic: where a layer is, what a point or a marquee hits,
 * how a drag snaps, how a handle resizes or rotates, and how a selection is
 * aligned, spread and reordered. Pure functions on the layer boxes, so every
 * gesture can be tested without a browser, and the stage only has to apply
 * the numbers they give.
 *
 * Coordinates are canvas pixels (the layout's own), never screen pixels;
 * the stage divides by the zoom before it asks.
 */

/** What the arithmetic reads of a layer: its box, its turn, and whether it can be touched. */
export interface Box {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  hidden?: boolean;
  locked?: boolean;
}

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

const RAD = Math.PI / 180;

/** Two decimals: what the layout stores, so a drag never writes 103.00000000001. */
export const round2 = (n: number) => Math.round(n * 100) / 100;

export const centreOf = (b: Rect): Point => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

/** Turn a point about a centre by `deg` degrees (clockwise on screen, as CSS rotates). */
export const rotatePoint = (p: Point, c: Point, deg: number): Point => {
  if (!deg) return p;
  const a = deg * RAD;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
};

/** The four corners of a layer as drawn, rotation included: top-left, top-right, bottom-right, bottom-left. */
export const cornersOf = (b: Box): Point[] => {
  const c = centreOf(b);
  const r = b.rotation ?? 0;
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.width, y: b.y },
    { x: b.x + b.width, y: b.y + b.height },
    { x: b.x, y: b.y + b.height },
  ].map((p) => rotatePoint(p, c, r));
};

/** The upright box a layer covers on the canvas, rotation included. */
export const boundsOf = (b: Box): Rect => {
  if (!b.rotation) return { x: b.x, y: b.y, width: b.width, height: b.height };
  const pts = cornersOf(b);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
};

/** The upright box around several layers. */
export const unionOf = (boxes: Box[]): Rect | null => {
  if (!boxes.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of boxes) {
    const r = boundsOf(b);
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.width);
    y1 = Math.max(y1, r.y + r.height);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
};

/** Whether a canvas point is on the layer as drawn, rotation included. */
export const contains = (b: Box, p: Point) => {
  const local = rotatePoint(p, centreOf(b), -(b.rotation ?? 0));
  return local.x >= b.x && local.x <= b.x + b.width && local.y >= b.y && local.y <= b.y + b.height;
};

/** The topmost layer under a point that can be picked on the canvas: shown and not locked. Layers paint first to last. */
export const hitTest = <T extends Box>(layers: readonly T[], p: Point): T | null => {
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i]!;
    if (l.hidden || l.locked) continue;
    if (contains(l, p)) return l;
  }
  return null;
};

const intersects = (a: Rect, b: Rect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

/** The rectangle a marquee drag makes, whichever way it was dragged. */
export const rectFrom = (a: Point, b: Point): Rect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(a.x - b.x),
  height: Math.abs(a.y - b.y),
});

/** The layers a marquee touches, in paint order. A layer covering the whole marquee is not picked: it is what the marquee was drawn on. */
export const marqueeHits = <T extends Box>(layers: readonly T[], m: Rect): T[] =>
  layers.filter((l) => {
    if (l.hidden || l.locked) return false;
    const r = boundsOf(l);
    if (!intersects(r, m)) return false;
    const covers = r.x <= m.x && r.y <= m.y && r.x + r.width >= m.x + m.width && r.y + r.height >= m.y + m.height;
    return !covers;
  });

// ─── Snapping ───────────────────────────────────────────────────────────

/** A line a moving edge may snap to, and why it is there (for the guide drawn on it). */
export interface SnapLine {
  /** "x" lines are vertical (an x position); "y" lines are horizontal. */
  axis: "x" | "y";
  at: number;
  kind: "canvas" | "centre" | "layer";
}

/** A guide to draw: the line, from where to where along it. */
export interface Guide {
  axis: "x" | "y";
  at: number;
  from: number;
  to: number;
}

/**
 * The lines on a canvas a selection may snap to: its edges, its centre, and
 * the edges and centres of every other shown layer.
 */
export const snapLines = (canvas: { width: number; height: number }, others: readonly Box[]): { lines: SnapLine[]; boxes: Rect[] } => {
  const lines: SnapLine[] = [
    { axis: "x", at: 0, kind: "canvas" },
    { axis: "x", at: canvas.width, kind: "canvas" },
    { axis: "x", at: canvas.width / 2, kind: "centre" },
    { axis: "y", at: 0, kind: "canvas" },
    { axis: "y", at: canvas.height, kind: "canvas" },
    { axis: "y", at: canvas.height / 2, kind: "centre" },
  ];
  const boxes: Rect[] = [];
  for (const o of others) {
    if (o.hidden) continue;
    const r = boundsOf(o);
    boxes.push(r);
    lines.push(
      { axis: "x", at: r.x, kind: "layer" },
      { axis: "x", at: r.x + r.width / 2, kind: "layer" },
      { axis: "x", at: r.x + r.width, kind: "layer" },
      { axis: "y", at: r.y, kind: "layer" },
      { axis: "y", at: r.y + r.height / 2, kind: "layer" },
      { axis: "y", at: r.y + r.height, kind: "layer" }
    );
  }
  return { lines, boxes };
};

/** The best of `candidates` (positions of the moving thing's edges) against the lines, within `threshold`. */
const nearest = (candidates: number[], lines: SnapLine[], axis: "x" | "y", threshold: number) => {
  let best: { shift: number; at: number } | null = null;
  for (const line of lines) {
    if (line.axis !== axis) continue;
    for (const c of candidates) {
      const d = line.at - c;
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.shift))) best = { shift: d, at: line.at };
    }
  }
  return best;
};

/** The guides for a box once snapped: every line any of its edges or centre now sits on. */
const guidesFor = (r: Rect, lines: SnapLine[], boxes: Rect[], canvas: { width: number; height: number }): Guide[] => {
  const out: Guide[] = [];
  const seen = new Set<string>();
  const xs = [r.x, r.x + r.width / 2, r.x + r.width];
  const ys = [r.y, r.y + r.height / 2, r.y + r.height];
  for (const line of lines) {
    const on = (line.axis === "x" ? xs : ys).some((v) => Math.abs(v - line.at) < 0.5);
    if (!on) continue;
    const key = `${line.axis}${round2(line.at)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // A guide runs across what it lines up: the moving box and every layer on the same line, or the canvas for its own lines.
    const along = line.axis === "x" ? [r.y, r.y + r.height] : [r.x, r.x + r.width];
    if (line.kind !== "layer") along.push(0, line.axis === "x" ? canvas.height : canvas.width);
    for (const b of boxes) {
      const edges = line.axis === "x" ? [b.x, b.x + b.width / 2, b.x + b.width] : [b.y, b.y + b.height / 2, b.y + b.height];
      if (edges.some((e) => Math.abs(e - line.at) < 0.5)) along.push(...(line.axis === "x" ? [b.y, b.y + b.height] : [b.x, b.x + b.width]));
    }
    out.push({ axis: line.axis, at: line.at, from: Math.min(...along), to: Math.max(...along) });
  }
  return out;
};

/**
 * A move of the selection by `delta`, snapped: the selection's box (left,
 * centre, right; top, middle, bottom) is pulled onto the nearest line within
 * `threshold` canvas pixels on each axis. Answers the snapped delta and the
 * guides to show.
 */
export const snapMove = (
  start: Rect,
  delta: Point,
  snap: { lines: SnapLine[]; boxes: Rect[] },
  canvas: { width: number; height: number },
  threshold: number
): { delta: Point; guides: Guide[] } => {
  const moved = { ...start, x: start.x + delta.x, y: start.y + delta.y };
  const sx = nearest([moved.x, moved.x + moved.width / 2, moved.x + moved.width], snap.lines, "x", threshold);
  const sy = nearest([moved.y, moved.y + moved.height / 2, moved.y + moved.height], snap.lines, "y", threshold);
  const d = { x: delta.x + (sx?.shift ?? 0), y: delta.y + (sy?.shift ?? 0) };
  const placed = { ...start, x: start.x + d.x, y: start.y + d.y };
  return { delta: d, guides: guidesFor(placed, snap.lines, snap.boxes, canvas) };
};

// ─── Resize ─────────────────────────────────────────────────────────────

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/** Which way a handle pulls each edge: -1 the left/top edge, 1 the right/bottom, 0 neither. */
const PULL: Record<Handle, { x: -1 | 0 | 1; y: -1 | 0 | 1 }> = {
  nw: { x: -1, y: -1 },
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
};

export const MIN_SIZE = 4;

/**
 * A layer resized by dragging one handle by `delta` (canvas pixels), its
 * rotation honoured: the edge opposite the handle stays where it is on the
 * canvas. With `keepRatio` the box keeps its proportions (shift); an edge
 * handle then grows the other side about its centre line. `snapX`/`snapY`
 * pull the moving edge onto a line (unrotated layers only).
 */
export const resizeBox = (
  b: Box,
  handle: Handle,
  delta: Point,
  opts: { keepRatio?: boolean; snap?: { lines: SnapLine[]; threshold: number } } = {}
): Rect => {
  const rot = b.rotation ?? 0;
  const pull = PULL[handle];
  // The drag in the layer's own frame.
  const local = rotatePoint(delta, { x: 0, y: 0 }, -rot);
  let w = b.width + pull.x * local.x;
  let h = b.height + pull.y * local.y;

  // Snapping the moving edges: only for an upright layer, where edges are canvas lines.
  if (!rot && opts.snap) {
    const { lines, threshold } = opts.snap;
    if (pull.x) {
      const edge = pull.x > 0 ? b.x + w : b.x + b.width - w;
      const s = nearest([edge], lines, "x", threshold);
      if (s) w += pull.x * s.shift;
    }
    if (pull.y) {
      const edge = pull.y > 0 ? b.y + h : b.y + b.height - h;
      const s = nearest([edge], lines, "y", threshold);
      if (s) h += pull.y * s.shift;
    }
  }

  if (opts.keepRatio && b.width > 0 && b.height > 0) {
    const ratio = b.width / b.height;
    if (pull.x && pull.y) {
      // A corner: whichever side grew more, by proportion, leads.
      if (Math.abs(w / b.width) > Math.abs(h / b.height)) h = w / ratio;
      else w = h * ratio;
    } else if (pull.x) h = w / ratio;
    else w = h * ratio;
  }
  w = Math.max(MIN_SIZE, w);
  h = Math.max(MIN_SIZE, h);

  // Where the fixed point is in the layer's frame, before: the opposite edge (or the centre line for an edge handle).
  const anchorLocal = (dw: number, dh: number) => ({ x: pull.x > 0 ? 0 : pull.x < 0 ? dw : dw / 2, y: pull.y > 0 ? 0 : pull.y < 0 ? dh : dh / 2 });
  const before = anchorLocal(b.width, b.height);
  const after = anchorLocal(w, h);
  // That point on the canvas, before; it must be the same point after.
  const c0 = centreOf(b);
  const fixed = rotatePoint({ x: b.x + before.x, y: b.y + before.y }, c0, rot);
  // The new box's centre, from the fixed point: the anchor's offset from the centre, rotated.
  const off = rotatePoint({ x: after.x - w / 2, y: after.y - h / 2 }, { x: 0, y: 0 }, rot);
  const c1 = { x: fixed.x - off.x, y: fixed.y - off.y };
  return { x: round2(c1.x - w / 2), y: round2(c1.y - h / 2), width: round2(w), height: round2(h) };
};

/**
 * Several layers resized together: each is scaled with the group's box, from
 * the group's opposite edge. Answers each layer's new box by id.
 */
export const resizeGroup = (boxes: Box[], handle: Handle, delta: Point, keepRatio: boolean): Map<string, Rect> => {
  const g = unionOf(boxes);
  const out = new Map<string, Rect>();
  if (!g) return out;
  const next = resizeBox({ id: "group", ...g }, handle, delta, { keepRatio });
  const kx = g.width ? next.width / g.width : 1;
  const ky = g.height ? next.height / g.height : 1;
  for (const b of boxes)
    out.set(b.id, {
      x: round2(next.x + (b.x - g.x) * kx),
      y: round2(next.y + (b.y - g.y) * ky),
      width: round2(Math.max(MIN_SIZE, b.width * kx)),
      height: round2(Math.max(MIN_SIZE, b.height * ky)),
    });
  return out;
};

// ─── Rotate ─────────────────────────────────────────────────────────────

/** Degrees in (-180, 180]. */
export const normaliseAngle = (deg: number) => {
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return round2(a);
};

/**
 * The rotation that points a layer's top at the pointer. With `step` (shift:
 * 15°) it moves in steps; without, it still settles on the four upright
 * angles within 3°, so straight is easy to get back to.
 */
export const rotationTo = (b: Box, pointer: Point, step?: number) => {
  const c = centreOf(b);
  let deg = (Math.atan2(pointer.y - c.y, pointer.x - c.x) * 180) / Math.PI + 90;
  if (step) deg = Math.round(deg / step) * step;
  else {
    const square = Math.round(deg / 90) * 90;
    if (Math.abs(deg - square) < 3) deg = square;
  }
  return normaliseAngle(deg);
};

// ─── Align and distribute ───────────────────────────────────────────────

export type Alignment = "left" | "hcentre" | "right" | "top" | "vcentre" | "bottom";

/**
 * Line the layers up: with two or more, against the box around them; one
 * alone, against the canvas. Each moves by its drawn box (rotation
 * included), so a turned layer lines up by what you see. Locked layers stay.
 */
export const align = (boxes: Box[], how: Alignment, canvas: { width: number; height: number }): Map<string, Point> => {
  const movable = boxes.filter((b) => !b.locked);
  const out = new Map<string, Point>();
  const ref: Rect = boxes.length > 1 ? unionOf(boxes)! : { x: 0, y: 0, width: canvas.width, height: canvas.height };
  for (const b of movable) {
    const r = boundsOf(b);
    let dx = 0;
    let dy = 0;
    if (how === "left") dx = ref.x - r.x;
    if (how === "hcentre") dx = ref.x + ref.width / 2 - (r.x + r.width / 2);
    if (how === "right") dx = ref.x + ref.width - (r.x + r.width);
    if (how === "top") dy = ref.y - r.y;
    if (how === "vcentre") dy = ref.y + ref.height / 2 - (r.y + r.height / 2);
    if (how === "bottom") dy = ref.y + ref.height - (r.y + r.height);
    out.set(b.id, { x: round2(b.x + dx), y: round2(b.y + dy) });
  }
  return out;
};

/**
 * Spread three or more layers so the gaps between them are equal, the first
 * and last staying put. Answers new positions by id; fewer than three, none.
 */
export const distribute = (boxes: Box[], axis: "x" | "y"): Map<string, Point> => {
  const out = new Map<string, Point>();
  if (boxes.length < 3) return out;
  const items = boxes.map((b) => ({ b, r: boundsOf(b) })).sort((p, q) => (axis === "x" ? p.r.x - q.r.x : p.r.y - q.r.y));
  const size = (r: Rect) => (axis === "x" ? r.width : r.height);
  const start = (r: Rect) => (axis === "x" ? r.x : r.y);
  const first = items[0]!.r;
  const last = items.at(-1)!.r;
  const span = start(last) + size(last) - start(first);
  const total = items.reduce((n, it) => n + size(it.r), 0);
  const gap = (span - total) / (items.length - 1);
  let at = start(first);
  for (const { b, r } of items) {
    const d = at - start(r);
    if (!b.locked) out.set(b.id, axis === "x" ? { x: round2(b.x + d), y: b.y } : { x: b.x, y: round2(b.y + d) });
    at += size(r) + gap;
  }
  return out;
};

// ─── Order ──────────────────────────────────────────────────────────────

export type OrderMove = "forward" | "backward" | "front" | "back";

/**
 * Layers restacked: the selected ones one step up or down, or to the top or
 * the bottom, keeping their order among themselves. Paint order: the first
 * layer is the bottom one.
 */
export const reorder = <T extends { id: string }>(layers: readonly T[], ids: ReadonlySet<string>, move: OrderMove): T[] => {
  const picked = layers.filter((l) => ids.has(l.id));
  const rest = layers.filter((l) => !ids.has(l.id));
  if (!picked.length) return [...layers];
  if (move === "front") return [...rest, ...picked];
  if (move === "back") return [...picked, ...rest];
  const next = [...layers];
  if (move === "forward") {
    for (let i = next.length - 2; i >= 0; i--) {
      if (ids.has(next[i]!.id) && !ids.has(next[i + 1]!.id)) [next[i], next[i + 1]] = [next[i + 1]!, next[i]!];
    }
  } else {
    for (let i = 1; i < next.length; i++) {
      if (ids.has(next[i]!.id) && !ids.has(next[i - 1]!.id)) [next[i], next[i - 1]] = [next[i - 1]!, next[i]!];
    }
  }
  return next;
};
