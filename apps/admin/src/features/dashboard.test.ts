import { describe, expect, it } from "vitest";
import { computeSegments, clampPercent, toPercent } from "@moa/ui";

import { changeOf } from "./analytics/delta";

/**
 * The arithmetic behind the dashboard's bars, dials and deltas.
 *
 * None of it is complicated, and all of it is the kind that renders as a
 * plausible-looking wrong number rather than a crash -- a bar that stops short
 * of its end, a green arrow on a metric that got worse, "NaN%" in a dial.
 */
describe("distribution segments", () => {
  it("adds up to exactly 100 for equal thirds", () => {
    // Rounding each share alone gives 33/33/33 and a visibly short bar.
    const segments = computeSegments([
      { key: "a", label: "A", value: 1, tone: "brand" },
      { key: "b", label: "B", value: 1, tone: "success" },
      { key: "c", label: "C", value: 1, tone: "warning" },
    ]);
    expect(segments.reduce((sum, s) => sum + s.percent, 0)).toBe(100);
  });

  it("gives the spare point to the biggest remainder", () => {
    const [a, b] = computeSegments([
      { key: "a", label: "A", value: 2, tone: "brand" },
      { key: "b", label: "B", value: 1, tone: "success" },
    ]);
    expect(a!.percent).toBe(67);
    expect(b!.percent).toBe(33);
  });

  it("reports zeroes rather than dividing by zero", () => {
    const segments = computeSegments([
      { key: "a", label: "A", value: 0, tone: "brand" },
      { key: "b", label: "B", value: 0, tone: "success" },
    ]);
    expect(segments.map((s) => s.percent)).toEqual([0, 0]);
  });

  it("treats a negative count as zero instead of inverting the bar", () => {
    const [a, b] = computeSegments([
      { key: "a", label: "A", value: -5, tone: "brand" },
      { key: "b", label: "B", value: 10, tone: "success" },
    ]);
    expect(a!.percent).toBe(0);
    expect(b!.percent).toBe(100);
  });

  it("keeps the caller's order so the bar does not reshuffle between fetches", () => {
    const keys = computeSegments([
      { key: "first", label: "First", value: 1, tone: "brand" },
      { key: "second", label: "Second", value: 99, tone: "success" },
    ]).map((s) => s.key);
    expect(keys).toEqual(["first", "second"]);
  });
});

describe("gauge percentages", () => {
  it("clamps out-of-range values rather than overdrawing the arc", () => {
    expect(clampPercent(140)).toBe(100);
    expect(clampPercent(-20)).toBe(0);
  });

  it("answers 0 for a zero total instead of NaN", () => {
    // Before any payment is captured, net/captured is 0/0.
    expect(toPercent(0, 0)).toBe(0);
    expect(Number.isNaN(toPercent(5, 0))).toBe(false);
  });

  it("computes the retained share", () => {
    expect(toPercent(700, 1000)).toBe(70);
  });
});

describe("deltas", () => {
  it("calls growth from zero 'new' rather than infinite percent", () => {
    expect(changeOf(12, 0)).toEqual({ label: "new", direction: "up", inverted: false });
  });

  it("reports nothing when both windows are empty", () => {
    expect(changeOf(0, 0)).toBeNull();
  });

  it("treats a sub-1% move as flat, with no direction colour", () => {
    expect(changeOf(1005, 1000)?.direction).toBe("flat");
  });

  it("signs the percentage", () => {
    expect(changeOf(150, 100)?.label).toBe("+50%");
    expect(changeOf(50, 100)?.label).toBe("-50%");
  });

  it("carries the inverted flag so a rising bad metric is not coloured green", () => {
    // Failed payments going up must not render as success.
    const delta = changeOf(20, 10, true);
    expect(delta).toEqual({ label: "+100%", direction: "up", inverted: true });
  });
});
