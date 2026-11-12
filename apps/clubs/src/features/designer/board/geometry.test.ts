import { describe, expect, it } from "vitest";

import {
  align,
  boundsOf,
  contains,
  distribute,
  hitTest,
  marqueeHits,
  rectFrom,
  reorder,
  resizeBox,
  resizeGroup,
  rotationTo,
  snapLines,
  snapMove,
} from "./geometry";

/**
 * The board's arithmetic, case by case: what a click picks, what a marquee
 * picks, where a drag snaps and which guides it shows, how a handle resizes
 * (the far edge staying put, rotation and all), how a turn handle turns,
 * and how a selection lines up, spreads and restacks.
 */

const box = (id: string, x: number, y: number, width: number, height: number, more: Record<string, unknown> = {}) => ({ id, x, y, width, height, ...more });
const CANVAS = { width: 1000, height: 600 };

describe("picking", () => {
  const layers = [box("bg", 0, 0, 1000, 600), box("name", 100, 100, 300, 60), box("qr", 700, 200, 200, 200, { locked: true }), box("off", 100, 100, 50, 50, { hidden: true })];

  it("picks the topmost layer under the point, skipping hidden and locked ones", () => {
    expect(hitTest(layers, { x: 120, y: 120 })?.id).toBe("name");
    // The locked QR lets the click through to the background.
    expect(hitTest(layers, { x: 800, y: 300 })?.id).toBe("bg");
    expect(hitTest(layers, { x: 1200, y: 300 })).toBeNull();
  });

  it("reads a turned layer by what is drawn", () => {
    const bar = box("bar", 0, 45, 100, 10, { rotation: 90 });
    // Turned upright about its centre (50, 50): it now runs from y 0 to 100 at x 45..55.
    expect(contains(bar, { x: 50, y: 5 })).toBe(true);
    expect(contains(bar, { x: 5, y: 50 })).toBe(false);
    expect(boundsOf(bar)).toEqual({ x: expect.closeTo(45, 5), y: expect.closeTo(0, 5), width: expect.closeTo(10, 5), height: expect.closeTo(100, 5) });
  });

  it("a marquee picks what it touches, but not the layer it was drawn on", () => {
    const m = rectFrom({ x: 380, y: 140 }, { x: 90, y: 90 });
    expect(m).toEqual({ x: 90, y: 90, width: 290, height: 50 });
    expect(marqueeHits(layers, m).map((l) => l.id)).toEqual(["name"]);
  });
});

describe("snapping", () => {
  const others = [box("logo", 500, 50, 100, 100)];
  const snap = snapLines(CANVAS, others);

  it("pulls a moving box onto the canvas centre and shows the guide", () => {
    // A 100-wide box at x 397 (centre 447) moved 50 right lands its centre at 497: 3 px from 500.
    const r = snapMove({ x: 397, y: 300, width: 100, height: 40 }, { x: 50, y: 0 }, snap, CANVAS, 6);
    expect(r.delta.x).toBe(53);
    expect(r.guides.some((g) => g.axis === "x" && g.at === 500)).toBe(true);
  });

  it("lines a box up with another layer's edge", () => {
    // Moving down so its top is 2 px under the logo's top (50).
    const r = snapMove({ x: 100, y: 300, width: 80, height: 40 }, { x: 0, y: -248 }, snap, CANVAS, 6);
    expect(r.delta.y).toBe(-250);
    expect(r.guides.find((g) => g.axis === "y" && g.at === 50)).toMatchObject({ from: 100, to: 600 });
  });

  it("leaves a move alone when nothing is near", () => {
    const r = snapMove({ x: 100, y: 300, width: 80, height: 40 }, { x: 33, y: 17 }, snap, CANVAS, 6);
    expect(r.delta).toEqual({ x: 33, y: 17 });
    expect(r.guides).toEqual([]);
  });
});

describe("resizing", () => {
  it("keeps the opposite corner where it was", () => {
    const b = box("a", 100, 100, 200, 100);
    expect(resizeBox(b, "se", { x: 50, y: 20 })).toEqual({ x: 100, y: 100, width: 250, height: 120 });
    expect(resizeBox(b, "nw", { x: 50, y: 20 })).toEqual({ x: 150, y: 120, width: 150, height: 80 });
    expect(resizeBox(b, "e", { x: -40, y: 99 })).toEqual({ x: 100, y: 100, width: 160, height: 100 });
  });

  it("keeps the proportions with shift", () => {
    const b = box("a", 0, 0, 200, 100);
    expect(resizeBox(b, "se", { x: 100, y: 0 }, { keepRatio: true })).toEqual({ x: 0, y: 0, width: 300, height: 150 });
    // An edge handle grows the other side about its centre line.
    expect(resizeBox(b, "e", { x: 100, y: 0 }, { keepRatio: true })).toEqual({ x: 0, y: -25, width: 300, height: 150 });
  });

  it("resizes a turned layer along its own sides, the far edge fixed on the canvas", () => {
    const b = box("a", 0, 0, 100, 50, { rotation: 90 });
    // Dragging the right handle (which now points down) 30 px down widens it by 30.
    const r = resizeBox(b, "e", { x: 0, y: 30 });
    expect(r.width).toBeCloseTo(130, 5);
    expect(r.height).toBeCloseTo(50, 5);
    // The left edge, drawn at the top, stays at the top: the centre moves down by 15.
    expect(r.y + r.height / 2).toBeCloseTo(25 + 15, 5);
    expect(r.x + r.width / 2).toBeCloseTo(50, 5);
  });

  it("snaps the moving edge of an upright layer", () => {
    const lines = snapLines(CANVAS, []).lines;
    expect(resizeBox(box("a", 100, 100, 200, 100), "e", { x: 697, y: 0 }, { snap: { lines, threshold: 6 } }).width).toBe(900);
  });

  it("never goes below a few pixels", () => {
    expect(resizeBox(box("a", 0, 0, 20, 20), "se", { x: -100, y: -100 })).toMatchObject({ width: 4, height: 4 });
  });

  it("scales a group with its box", () => {
    const out = resizeGroup([box("a", 0, 0, 100, 100), box("b", 100, 100, 100, 100)], "se", { x: 200, y: 200 }, false);
    expect(out.get("b")).toEqual({ x: 200, y: 200, width: 200, height: 200 });
  });
});

describe("rotating", () => {
  const b = box("a", 0, 0, 100, 100);
  it("points the top at the pointer", () => {
    expect(rotationTo(b, { x: 150, y: 50 })).toBe(90);
    expect(rotationTo(b, { x: 50, y: 150 })).toBe(180);
  });
  it("settles on upright, and steps by 15° with shift", () => {
    expect(rotationTo(b, { x: 52, y: -100 })).toBe(0);
    expect(rotationTo(b, { x: 100, y: -10 }, 15)).toBe(45);
  });
});

describe("arranging", () => {
  const a = box("a", 10, 10, 50, 20);
  const b = box("b", 100, 40, 80, 20);
  const c = box("c", 300, 70, 20, 20);

  it("aligns to the selection's box, or to the canvas for one layer", () => {
    expect(align([a, b, c], "left", CANVAS)).toEqual(new Map([["a", { x: 10, y: 10 }], ["b", { x: 10, y: 40 }], ["c", { x: 10, y: 70 }]]));
    expect(align([a, b], "bottom", CANVAS).get("a")).toEqual({ x: 10, y: 40 });
    expect(align([a], "hcentre", CANVAS).get("a")).toEqual({ x: 475, y: 10 });
  });

  it("leaves locked layers where they are", () => {
    expect(align([a, { ...b, locked: true }], "top", CANVAS).has("b")).toBe(false);
  });

  it("spreads three or more with equal gaps, the ends staying put", () => {
    const out = distribute([a, b, c], "x");
    // Span 10..320 = 310, widths 150: two gaps of 80.
    expect(out.get("a")).toEqual({ x: 10, y: 10 });
    expect(out.get("b")).toEqual({ x: 140, y: 40 });
    expect(out.get("c")).toEqual({ x: 300, y: 70 });
    expect(distribute([a, b], "x").size).toBe(0);
  });

  it("restacks: forward, backward, to the front and the back, keeping the picked ones' order", () => {
    const layers = ["a", "b", "c", "d"].map((id) => ({ id }));
    const ids = (l: { id: string }[]) => l.map((x) => x.id).join("");
    expect(ids(reorder(layers, new Set(["a", "b"]), "forward"))).toBe("cabd");
    expect(ids(reorder(layers, new Set(["d"]), "backward"))).toBe("abdc");
    expect(ids(reorder(layers, new Set(["b"]), "front"))).toBe("acdb");
    expect(ids(reorder(layers, new Set(["c", "d"]), "back"))).toBe("cdab");
  });
});
