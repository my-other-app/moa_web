import { describe, expect, it } from "vitest";

import { CANVAS_PRESETS, matchPreset, presetsFor, startersFor } from "./design-presets";
import { layerSchema } from "./layers";

/**
 * Sizes to work at, and layouts to start from.
 *
 * A club with artwork uploads it and the canvas takes the image's size. A
 * club without one had a blank area at whatever size the renderer happened
 * to use, which is the hardest possible place to begin.
 */
describe("canvas presets", () => {
  it("offers ticket sizes to tickets and certificate sizes to certificates", () => {
    expect(presetsFor("ticket").some((p) => p.id === "ticket")).toBe(true);
    expect(presetsFor("certificate").some((p) => p.id === "ticket")).toBe(false);
  });

  it("recognises a canvas that matches a preset", () => {
    expect(matchPreset({ width: 1560, height: 690 })?.id).toBe("ticket");
  });

  it("treats anything else as custom", () => {
    // An uploaded design sets the canvas to the image's own size, which is
    // almost never one of these.
    expect(matchPreset({ width: 1234, height: 567 })).toBeNull();
  });

  it("gives every preset a real size", () => {
    for (const preset of CANVAS_PRESETS) {
      expect(preset.width).toBeGreaterThan(0);
      expect(preset.height).toBeGreaterThan(0);
    }
  });
});

describe("starting layouts", () => {
  const canvas = { width: 1560, height: 690 };

  it("offers layouts for both kinds", () => {
    expect(startersFor("ticket").length).toBeGreaterThan(0);
    expect(startersFor("certificate").length).toBeGreaterThan(0);
  });

  it.each(startersFor("ticket").map((l) => [l.label, l] as const))(
    "builds %s into valid layers",
    (_label, starter) => {
      // The schema is what the API validates against, so a layout that
      // produces an invalid layer fails on save, after the design is done.
      for (const layer of starter.build(canvas)) {
        expect(layerSchema.safeParse(layer).success).toBe(true);
      }
    }
  );

  it("places every layer inside the canvas", () => {
    for (const starter of startersFor("ticket")) {
      for (const layer of starter.build(canvas)) {
        expect(layer.x).toBeGreaterThanOrEqual(0);
        expect(layer.y).toBeGreaterThanOrEqual(0);
        expect(layer.x).toBeLessThan(canvas.width);
        expect(layer.y).toBeLessThan(canvas.height);
      }
    }
  });

  it("scales to whatever canvas it is dropped onto", () => {
    // Positions are fractions, so a layout that only worked at one size
    // would be worse than none.
    const small = { width: 800, height: 400 };
    const built = startersFor("ticket")[0]!.build(small);

    for (const layer of built) {
      expect(layer.x).toBeLessThan(small.width);
      expect(layer.y).toBeLessThan(small.height);
    }
  });

  it("gives each layer a distinct id", () => {
    const built = startersFor("certificate")[0]!.build({ width: 1240, height: 1754 });
    const ids = new Set(built.map((l) => l.id));

    expect(ids.size).toBe(built.length);
  });

  it("uses tokens rather than literal names", () => {
    // A starting layout with "Jane Doe" typed into it ships that to every
    // attendee the first time someone forgets to change it.
    const built = startersFor("ticket")[0]!.build(canvas);
    const names = built.filter((l) => l.name === "Guest name");

    expect(names.length).toBeGreaterThan(0);
    for (const layer of names) expect(layer.text).toContain("{{");
  });
});
