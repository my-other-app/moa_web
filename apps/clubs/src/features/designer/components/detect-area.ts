"use client";

import type { TicketArea } from "@moa/layout";

/** Colour distance (0–441) between two pixels of an RGBA buffer. */
const dist = (d: Uint8ClampedArray, a: number, b: number) => {
  const dr = d[a]! - d[b]!;
  const dg = d[a + 1]! - d[b + 1]!;
  const db = d[a + 2]! - d[b + 2]!;
  return Math.sqrt(dr * dr + dg * dg + db * db);
};

/** A jump this big between pixels three apart is a printed edge, not a gradient or JPEG noise. */
const EDGE = 32;
const GAP = 3;

/** The most common value in a list, if enough of the list agrees on it. */
const mode = (values: number[], need: number) => {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: { key: number; n: number } | null = null;
  for (const [key, n] of counts) if (!best || n > best.n) best = { key, n };
  return best && best.n >= need ? best.key : null;
};

/**
 * Where the ticket sits inside an exported image. A file exported with its
 * artboard carries a backdrop around the ticket: transparent, or a colour the
 * ticket's straight edges stand out from. Transparent margins are trimmed by
 * alpha; otherwise each row and column is scanned inward for its first sharp
 * edge, and the edge most rows agree on is the ticket's. Corner radius is read
 * off the top row. Null when the ticket is the whole image, or nothing that
 * looks like a ticket was found -- the person can always draw it by hand.
 */
export const detectTicketArea = async (
  source: Blob,
  target: { width: number; height: number }
): Promise<TicketArea | null> => {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source);
  } catch {
    return null;
  }
  // Full resolution up to the size templates are stored at, so the edge lands on the pixel.
  const s = Math.min(1, 2400 / bitmap.width);
  const W = Math.max(1, Math.round(bitmap.width * s));
  const H = Math.max(1, Math.round(bitmap.height * s));
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, W, H);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, W, H);
  const at = (x: number, y: number) => (y * W + x) * 4;

  let box: { l: number; t: number; r: number; b: number } | null = null;

  // Transparent margins: the ticket is whatever has pixels.
  let transparentEdge = false;
  for (let x = 0; x < W && !transparentEdge; x++)
    if (data[at(x, 0) + 3]! < 250 || data[at(x, H - 1) + 3]! < 250) transparentEdge = true;
  for (let y = 0; y < H && !transparentEdge; y++)
    if (data[at(0, y) + 3]! < 250 || data[at(W - 1, y) + 3]! < 250) transparentEdge = true;
  if (transparentEdge) {
    let l = W;
    let t = H;
    let r = -1;
    let b = -1;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (data[at(x, y) + 3]! > 16) {
          if (x < l) l = x;
          if (x > r) r = x;
          if (y < t) t = y;
          if (y > b) b = y;
        }
    if (r < 0) return null;
    box = { l, t, r: r + 1, b: b + 1 };
  } else {
    const lefts: number[] = [];
    const rights: number[] = [];
    const tops: number[] = [];
    const bottoms: number[] = [];
    for (let y = 0; y < H; y++) {
      // The first pixel clearly unlike the one a few back is the ticket's edge; right and bottom are exclusive.
      for (let x = GAP; x < W; x++)
        if (dist(data, at(x, y), at(x - GAP, y)) > EDGE) {
          lefts.push(x);
          break;
        }
      for (let x = W - 1 - GAP; x >= 0; x--)
        if (dist(data, at(x, y), at(x + GAP, y)) > EDGE) {
          rights.push(x + 1);
          break;
        }
    }
    for (let x = 0; x < W; x++) {
      for (let y = GAP; y < H; y++)
        if (dist(data, at(x, y), at(x, y - GAP)) > EDGE) {
          tops.push(y);
          break;
        }
      for (let y = H - 1 - GAP; y >= 0; y--)
        if (dist(data, at(x, y), at(x, y + GAP)) > EDGE) {
          bottoms.push(y + 1);
          break;
        }
    }
    // A real edge is straight: a good share of the rows land on the same pixel.
    const l = mode(lefts, H * 0.12);
    const r = mode(rights, H * 0.12);
    const t = mode(tops, W * 0.12);
    const b = mode(bottoms, W * 0.12);
    if (l === null || r === null || t === null || b === null) return null;
    box = { l, t, r, b };
  }

  const w = box.r - box.l;
  const h = box.b - box.t;
  // Nothing worth cropping, or too small to be the ticket rather than a logo on the backdrop.
  if (w < W * 0.25 || h < H * 0.25) return null;
  if (box.l <= 4 && box.t <= 4 && box.r >= W - 4 && box.b >= H - 4) return null;

  // Corner radius: walk the diagonal in from the top-left corner until the
  // ticket starts, judged against the backdrop just outside the corner. On a
  // quarter circle that distance is r·(1 − 1/√2).
  let radius = 0;
  if (box.l >= 4 && box.t >= 4) {
    const outside = at(box.l - 4, box.t - 4);
    const solid = (x: number, y: number) =>
      transparentEdge ? data[at(x, y) + 3]! > 16 : dist(data, at(x, y), outside) > EDGE;
    let d = 0;
    const limit = Math.floor(Math.min(w, h) / 2);
    while (d < limit && !solid(box.l + d, box.t + d)) d++;
    radius = d >= limit ? 0 : Math.round(d / (1 - Math.SQRT1_2));
    if (radius < 4) radius = 0;
  }

  const k = target.width / W;
  const round = (n: number) => Math.round(n * k);
  return {
    x: round(box.l),
    y: round(box.t),
    width: Math.max(100, round(w)),
    height: Math.max(50, round(h)),
    radius: round(radius),
  };
};
