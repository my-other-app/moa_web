import type { Canvas, Layer } from "./layers";

/**
 * Snapping a dragged layer to the edges and centres around it.
 *
 * Without it, "centred" on someone else's artwork means dragging until it
 * looks right and being two pixels out on the printed ticket. The guides are
 * returned alongside the position so the canvas can draw exactly the lines
 * that caused the snap, rather than guessing which ones to show.
 *
 * Holding alt skips this entirely -- the caller decides, because a club
 * placing something deliberately off-centre needs a way to say so.
 */

/** How close, in artwork pixels, before an edge pulls. */
const THRESHOLD = 8;

export interface Guide {
  axis: "x" | "y";
  /** Artwork coordinate of the line to draw. */
  at: number;
}

export interface SnapResult {
  x: number;
  y: number;
  guides: Guide[];
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A layer's box on the artwork.
 *
 * Text layers may have no width and no height at all, in which case there is
 * nothing to align their far edge against -- only their origin snaps, which
 * is honest rather than inventing a box.
 */
export function boxOf(layer: Layer): Box {
  const width = layer.width ?? 0;
  const height =
    layer.height ?? (layer.type === "qr" ? (layer.width ?? 0) : 0);
  return { x: layer.x, y: layer.y, width, height };
}

/** Candidate lines on one axis: the canvas, then every other visible layer. */
function targets(
  axis: "x" | "y",
  canvas: Canvas,
  others: readonly Layer[]
): number[] {
  const extent = axis === "x" ? canvas.width : canvas.height;
  const lines: number[] = [];
  if (extent) lines.push(0, Math.round(extent / 2), extent);

  for (const other of others) {
    if (other.hidden) continue;
    const box = boxOf(other);
    const start = axis === "x" ? box.x : box.y;
    const size = axis === "x" ? box.width : box.height;
    lines.push(start);
    if (size) lines.push(start + Math.round(size / 2), start + size);
  }
  return lines;
}

/**
 * The nearest snap for one axis.
 *
 * Each of the moving box's own lines -- its start, centre and end -- is
 * tested against every target, because a layer aligns by whichever of its
 * edges is closest, not only by its origin.
 */
function snapAxis(
  axis: "x" | "y",
  position: number,
  size: number,
  canvas: Canvas,
  others: readonly Layer[],
  scale: number
): { position: number; guide: Guide | null } {
  // The threshold is in screen pixels, so zooming out does not make every
  // line in the design grab the layer at once.
  const tolerance = THRESHOLD / Math.max(scale, 0.05);

  const own = size
    ? [
        { offset: 0, line: position },
        { offset: size / 2, line: position + size / 2 },
        { offset: size, line: position + size },
      ]
    : [{ offset: 0, line: position }];

  let best: { distance: number; position: number; at: number } | null = null;

  for (const target of targets(axis, canvas, others)) {
    for (const edge of own) {
      const distance = Math.abs(edge.line - target);
      if (distance > tolerance) continue;
      if (best && distance >= best.distance) continue;
      best = {
        distance,
        position: Math.round(target - edge.offset),
        at: target,
      };
    }
  }

  if (!best) return { position: Math.round(position), guide: null };
  return { position: best.position, guide: { axis, at: best.at } };
}

/**
 * Snap a dragged position, returning where it landed and why.
 *
 * `others` must exclude the layer being dragged, or it snaps to itself and
 * never moves.
 */
export function snapPosition(
  next: { x: number; y: number },
  moving: Layer,
  canvas: Canvas,
  others: readonly Layer[],
  scale: number
): SnapResult {
  const box = boxOf(moving);
  const x = snapAxis("x", next.x, box.width, canvas, others, scale);
  const y = snapAxis("y", next.y, box.height, canvas, others, scale);

  const guides: Guide[] = [];
  if (x.guide) guides.push(x.guide);
  if (y.guide) guides.push(y.guide);

  return { x: x.position, y: y.position, guides };
}
