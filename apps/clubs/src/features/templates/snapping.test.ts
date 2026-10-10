import { describe, expect, it } from "vitest";

import { newLayer } from "./layers";
import { snapPosition } from "./snapping";

/**
 * Snapping a dragged layer.
 *
 * Without it, "centred" on someone else's artwork means dragging until it
 * looks right and being two pixels out on the printed ticket. The guides
 * come back with the position so the canvas draws the line that caused the
 * snap rather than guessing which one to show.
 */
const canvas = { width: 1000, height: 600 };
const scale = 1;

function layer(overrides: Partial<ReturnType<typeof newLayer>> = {}) {
  return { ...newLayer("shape", canvas), width: 200, height: 100, ...overrides };
}

describe("snapping", () => {
  it("pulls a near edge onto the canvas edge", () => {
    const moving = layer();

    const result = snapPosition({ x: 3, y: 2 }, moving, canvas, [], scale);

    expect(result).toMatchObject({ x: 0, y: 0 });
  });

  it("centres a layer when its middle is near the canvas middle", () => {
    const moving = layer({ width: 200, height: 100 });

    // Centre of a 200-wide box at x=404 is 504, four from the canvas centre.
    const result = snapPosition({ x: 404, y: 252 }, moving, canvas, [], scale);

    expect(result.x).toBe(400);
    expect(result.y).toBe(250);
  });

  it("reports the line that caused each snap", () => {
    const moving = layer();

    const result = snapPosition({ x: 3, y: 300 }, moving, canvas, [], scale);

    expect(result.guides).toContainEqual({ axis: "x", at: 0 });
  });

  it("leaves a position alone when nothing is near", () => {
    const moving = layer();

    const result = snapPosition({ x: 321, y: 177 }, moving, canvas, [], scale);

    expect(result).toMatchObject({ x: 321, y: 177, guides: [] });
  });

  /*
   * 700 rather than 500: the canvas centre is 500, so a layer placed there
   * snaps whether or not the sibling is considered -- which is a test that
   * passes for the wrong reason, and did until it was written down.
   */
  it("aligns one layer to another's edge", () => {
    const moving = layer({ id: "moving" });
    const other = layer({ id: "other", x: 700, y: 300 });

    const result = snapPosition({ x: 697, y: 420 }, moving, canvas, [other], scale);

    expect(result.x).toBe(700);
  });

  it("ignores a hidden layer", () => {
    // It is not on the artwork, so aligning to it would align to nothing.
    const moving = layer({ id: "moving" });
    const hidden = layer({ id: "hidden", x: 700, y: 300, hidden: true });

    const result = snapPosition({ x: 697, y: 420 }, moving, canvas, [hidden], scale);

    expect(result.x).toBe(697);
  });

  it("widens its reach as you zoom out, not its pull in design pixels", () => {
    /*
     * The threshold is in screen pixels. At 25% a layer eight artwork pixels
     * away is two pixels from the cursor, so it should still snap -- and at
     * 100% a layer thirty away should not.
     */
    const moving = layer();

    expect(snapPosition({ x: 20, y: 300 }, moving, canvas, [], 0.25).x).toBe(0);
    expect(snapPosition({ x: 20, y: 300 }, moving, canvas, [], 1).x).toBe(20);
  });

  it("snaps a text layer with no box by its origin alone", () => {
    // An auto-width text layer has no measured far edge, and inventing one
    // would align it by a box it does not have.
    const moving = { ...newLayer("text", canvas), width: null, height: null };

    const result = snapPosition({ x: 2, y: 2 }, moving, canvas, [], scale);

    expect(result).toMatchObject({ x: 0, y: 0 });
  });
});
