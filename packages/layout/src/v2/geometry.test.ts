import { describe, expect, it } from "vitest";

import {
  alignLayers,
  boxCorners,
  distributeLayers,
  hitTest,
  hitTestAll,
  layerBox,
  layersInRect,
  normalizeRect,
  pointInBox,
  resizeBox,
  rotatedBounds,
  rotatePoint,
  rotationTo,
  snapCandidates,
  snapRect,
  snapValue,
  unionBounds,
} from "./geometry";
import { type LayerV2, parseLayoutV2 } from "./schema";
import { minimal } from "./test-utils";

const rect = (id: string, x: number, y: number, width: number, height: number, more: Record<string, unknown> = {}) => ({
  kind: "shape", id, name: id, x, y, width, height, fill: { type: "solid", color: "#000000" }, ...more,
});
const layers = (...raw: Record<string, unknown>[]): LayerV2[] => parseLayoutV2(minimal(raw)).layers;
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe("boxes and rotation", () => {
  it("turns points clockwise on screen, as CSS rotate() does", () => {
    const p = rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, 90);
    close(p.x, 0);
    close(p.y, 10);
  });

  it("finds a turned box's corners and the bounds round them", () => {
    const [l] = layers(rect("a", 0, 0, 100, 50, { rotation: 90 }));
    const c = boxCorners(layerBox(l!));
    close(c[0].x, 75);
    close(c[0].y, -25);
    const b = rotatedBounds(l!);
    close(b.x, 25);
    close(b.y, -25);
    close(b.width, 50);
    close(b.height, 100);
    expect(rotatedBounds({ x: 1, y: 2, width: 3, height: 4 })).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    const d = rotatedBounds({ x: 0, y: 0, width: 100, height: 100, rotation: 45 });
    close(d.width, 100 * Math.SQRT2);
    expect(unionBounds([{ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: -5, width: 5, height: 5 }])).toEqual({ x: 0, y: -5, width: 25, height: 15 });
    expect(unionBounds([])).toBeNull();
  });

  it("hits a point inside the box as drawn, rotation undone", () => {
    const box = { x: 0, y: 0, width: 100, height: 10, rotation: 90 };
    expect(pointInBox({ x: 50, y: 40 }, box)).toBe(true);
    expect(pointInBox({ x: 5, y: 5 }, box)).toBe(false);
    expect(pointInBox({ x: 50, y: -46 }, box, 2)).toBe(true);
  });
});

describe("hit testing", () => {
  const ls = layers(rect("bottom", 0, 0, 200, 200), rect("top", 50, 50, 50, 50), rect("ghost", 0, 0, 300, 300, { hidden: true }), rect("pin", 150, 150, 40, 40, { locked: true }));

  it("takes the topmost layer under the point, skipping hidden ones", () => {
    expect(hitTest(ls, { x: 60, y: 60 })?.id).toBe("top");
    expect(hitTest(ls, { x: 10, y: 10 })?.id).toBe("bottom");
    expect(hitTest(ls, { x: 250, y: 250 })).toBeNull();
    expect(hitTest(ls, { x: 250, y: 250 }, { includeHidden: true })?.id).toBe("ghost");
  });

  it("hits locked layers unless told not to", () => {
    expect(hitTest(ls, { x: 160, y: 160 })?.id).toBe("pin");
    expect(hitTest(ls, { x: 160, y: 160 }, { includeLocked: false })?.id).toBe("bottom");
    expect(hitTestAll(ls, { x: 60, y: 60 }).map((l) => l.id)).toEqual(["top", "bottom"]);
  });

  it("selects by marquee: touching, or held whole; never hidden or locked", () => {
    expect(layersInRect(ls, { x: 40, y: 40, width: 20, height: 20 }).map((l) => l.id)).toEqual(["bottom", "top"]);
    expect(layersInRect(ls, { x: 40, y: 40, width: 70, height: 70 }, true).map((l) => l.id)).toEqual(["top"]);
    expect(layersInRect(ls, { x: 110, y: 110, width: -70, height: -70 }, true).map((l) => l.id)).toEqual(["top"]);
    expect(normalizeRect({ x: 10, y: 10, width: -5, height: -5 })).toEqual({ x: 5, y: 5, width: 5, height: 5 });
  });
});

describe("snapping", () => {
  const ls = layers(rect("a", 100, 100, 50, 50), rect("moving", 0, 0, 20, 20), rect("hid", 10, 10, 1, 1, { hidden: true }));
  const lines = snapCandidates({ width: 384, height: 576 }, ls, ["moving"]);

  it("offers the canvas's edges and centre and every other visible layer's", () => {
    expect(lines.filter((l) => l.source === "canvas").map((l) => `${l.axis}${l.at}`)).toEqual(["x0", "x192", "x384", "y0", "y288", "y576"]);
    expect(lines.filter((l) => l.source === "a").map((l) => `${l.axis}${l.at}`)).toEqual(["x100", "x125", "x150", "y100", "y125", "y150"]);
    expect(lines.some((l) => l.source === "moving" || l.source === "hid")).toBe(false);
  });

  it("moves an edge or centre onto the nearest line within the threshold", () => {
    // Its left edge meets a's right; its top, the canvas's middle.
    const s = snapRect({ x: 147, y: 290, width: 20, height: 20 }, lines, 6);
    expect(s.dx).toBe(3);
    expect(s.dy).toBe(-2);
    expect(s.guides.map((g) => `${g.axis}${g.at}:${g.source}`)).toEqual(["x150:a", "y288:canvas"]);
    expect(s.guides[0]).toMatchObject({ from: 100, to: 310 });
    expect(snapRect({ x: 30, y: 30, width: 20, height: 20 }, lines, 6)).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it("snaps a centre to a centre", () => {
    const s = snapRect({ x: 180, y: 0, width: 20, height: 20 }, lines, 4);
    expect(s.dx).toBe(2);
    expect(s.guides[0]).toMatchObject({ axis: "x", at: 192, source: "canvas" });
  });

  it("snaps a single value, for resize handles", () => {
    expect(snapValue(153, lines, "x", 5)).toMatchObject({ value: 150, line: { source: "a" } });
    expect(snapValue(170, lines, "x", 5)).toEqual({ value: 170, line: null });
  });
});

describe("align and distribute", () => {
  const ls = layers(rect("a", 10, 10, 20, 20), rect("b", 50, 40, 40, 10), rect("c", 200, 100, 10, 30), rect("lock", 0, 0, 5, 5, { locked: true }));

  it("lines layers up to the selection's bounds", () => {
    expect(alignLayers(ls, ["a", "b", "c"], "left")).toEqual([{ id: "a", x: 10, y: 10 }, { id: "b", x: 10, y: 40 }, { id: "c", x: 10, y: 100 }]);
    expect(alignLayers(ls, ["a", "b", "c"], "right").map((m) => m.x)).toEqual([190, 170, 200]);
    expect(alignLayers(ls, ["a", "b", "c"], "middle").map((m) => m.y)).toEqual([60, 65, 55]);
    expect(alignLayers(ls, ["a", "lock"], "top")).toEqual([{ id: "a", x: 10, y: 10 }]);
  });

  it("lines one layer, or any with to: canvas, up to the canvas", () => {
    expect(alignLayers(ls, ["a"], "center", { canvas: { width: 384, height: 576 } })).toEqual([{ id: "a", x: 182, y: 10 }]);
    expect(alignLayers(ls, ["a", "b"], "bottom", { to: "canvas", canvas: { width: 384, height: 576 } }).map((m) => m.y)).toEqual([556, 566]);
  });

  it("aligns turned layers by what is drawn", () => {
    const [t] = layers(rect("t", 100, 100, 100, 50, { rotation: 90 }));
    // Turned 90°, its drawn left edge is at 125.
    expect(alignLayers([t!], ["t"], "left", { canvas: { width: 384, height: 576 } })[0]!.x).toBeCloseTo(-25, 6);
  });

  it("spaces three or more evenly, the ends staying put", () => {
    expect(distributeLayers(ls, ["a", "b", "c"], "horizontal")).toEqual([{ id: "a", x: 10, y: 10 }, { id: "b", x: 95, y: 40 }, { id: "c", x: 200, y: 100 }]);
    expect(distributeLayers(ls, ["c", "a", "b"], "vertical").map((m) => [m.id, m.y])).toEqual([["a", 10], ["b", 60], ["c", 100]]);
    expect(distributeLayers(ls, ["a", "b"], "horizontal")).toEqual([]);
  });
});

describe("resizing and rotating", () => {
  it("drags a corner, the opposite one staying put", () => {
    expect(resizeBox({ x: 10, y: 10, width: 100, height: 50, rotation: 0 }, "se", { x: 150, y: 90 })).toEqual({ x: 10, y: 10, width: 140, height: 80, rotation: 0 });
    expect(resizeBox({ x: 10, y: 10, width: 100, height: 50, rotation: 0 }, "nw", { x: 0, y: 0 })).toEqual({ x: 0, y: 0, width: 110, height: 60, rotation: 0 });
    expect(resizeBox({ x: 10, y: 10, width: 100, height: 50, rotation: 0 }, "e", { x: 60, y: 999 })).toEqual({ x: 10, y: 10, width: 50, height: 50, rotation: 0 });
  });

  it("keeps the ratio with shift, and never goes under the minimum", () => {
    expect(resizeBox({ x: 0, y: 0, width: 100, height: 50, rotation: 0 }, "se", { x: 200, y: 60 }, { keepRatio: true })).toEqual({ x: 0, y: 0, width: 200, height: 100, rotation: 0 });
    expect(resizeBox({ x: 0, y: 0, width: 100, height: 50, rotation: 0 }, "w", { x: 500, y: 0 }, { min: 4 }).width).toBe(4);
  });

  it("keeps a turned box's opposite corner where it is on screen", () => {
    const b = { x: 0, y: 0, width: 100, height: 50, rotation: 30 };
    const fixed = boxCorners(b)[0];
    const handle = boxCorners(b)[2];
    const out = resizeBox(b, "se", { x: handle.x + 20, y: handle.y + 10 });
    const after = boxCorners(out)[0];
    close(after.x, fixed.x);
    close(after.y, fixed.y);
    expect(out.rotation).toBe(30);
  });

  it("points the box's top at the rotate handle, snapped when asked", () => {
    const b = { x: 0, y: 0, width: 100, height: 100 };
    expect(rotationTo(b, { x: 50, y: -100 })).toBe(0);
    expect(rotationTo(b, { x: 200, y: 50 })).toBe(90);
    expect(rotationTo(b, { x: 50, y: 200 })).toBe(180);
    expect(rotationTo(b, { x: -100, y: 50 })).toBe(-90);
    expect(rotationTo(b, { x: 120, y: -10 }, 15)).toBe(45);
  });
});
