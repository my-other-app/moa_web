import { describe, expect, it } from "vitest";

import cases from "./text-fit.cases.json";
import { estimateTextWidth, fitFontSize, linesNeeded } from "./text-fit";

/**
 * `text-fit.ts` is a port of the renderer's own rule, in
 * `moa_backend/backend/app/api/templates_fit.py`. The preview and the PDF have
 * to shrink by the same amount, or the editor shows a size the attendee never
 * receives.
 *
 * The case table below is the same file as
 * `moa_backend/backend/tests/fixtures/text_fit_cases.json`, and
 * `tests/test_text_fitting.py` there checks the identical cases against the
 * Python. Tuning the character widths on either side fails that side's tests,
 * which is the only thing that points whoever is tuning at the other copy.
 */
describe("agreement with the renderer", () => {
  it.each(cases)(
    "fits $text at $fontSize in $boxWidth px",
    ({ text, fontSize, boxWidth, maxLines, bold, letterSpacing, expected }) => {
      expect(
        fitFontSize(text, { fontSize, boxWidth, maxLines, bold, letterSpacing })
      ).toBe(expected);
    }
  );

  it.each(cases)(
    "wraps $text onto $expectedLines line(s)",
    ({ text, fontSize, boxWidth, bold, letterSpacing, expectedLines }) => {
      expect(linesNeeded(text, boxWidth, fontSize, { bold, letterSpacing })).toBe(
        expectedLines
      );
    }
  );
});

describe("fitFontSize", () => {
  it("leaves a name that already fits at its chosen size", () => {
    expect(fitFontSize("Ann Lee", { fontSize: 40, boxWidth: 600 })).toBe(40);
  });

  it("shrinks a name too long for its box", () => {
    expect(
      fitFontSize("Lakshminarayanan Venkataraman", { fontSize: 40, boxWidth: 300 })
    ).toBeLessThan(40);
  });

  it("stops shrinking while the text is still readable", () => {
    // Past a point, clipping is the more honest failure than 6px type.
    const fitted = fitFontSize("Lakshminarayanan Venkataraman", {
      fontSize: 40,
      boxWidth: 20,
    });

    expect(fitted).toBeGreaterThanOrEqual(8);
    expect(fitted).toBeGreaterThanOrEqual(40 * 0.4);
  });

  it("allows a larger size when more lines are permitted", () => {
    const one = fitFontSize("Lakshminarayanan Venkataraman", {
      fontSize: 40,
      boxWidth: 300,
      maxLines: 1,
    });
    const two = fitFontSize("Lakshminarayanan Venkataraman", {
      fontSize: 40,
      boxWidth: 300,
      maxLines: 2,
    });

    expect(two).toBeGreaterThan(one);
  });

  it("never shrinks a layer with no box to fit into", () => {
    // Width is optional, and without it there is nothing to measure against.
    expect(
      fitFontSize("Lakshminarayanan Venkataraman", { fontSize: 40, boxWidth: null })
    ).toBe(40);
  });

  it.each(["", "   "])("leaves empty text alone (%j)", (text) => {
    expect(fitFontSize(text, { fontSize: 40, boxWidth: 10 })).toBe(40);
  });
});

describe("estimateTextWidth", () => {
  it("estimates wide characters wider than narrow ones", () => {
    // A flat average puts these badly wrong in opposite directions.
    expect(estimateTextWidth("WWWW", 20)).toBeGreaterThan(
      estimateTextWidth("iiii", 20) * 2
    );
  });

  it("estimates bold text wider", () => {
    const text = "Lakshminarayanan Venkataraman";

    expect(estimateTextWidth(text, 20, { bold: true })).toBeGreaterThan(
      estimateTextWidth(text, 20)
    );
  });

  it("adds letter spacing between characters, not after each one", () => {
    const text = "Ann Lee";

    expect(estimateTextWidth(text, 20, { letterSpacing: 5 })).toBeCloseTo(
      estimateTextWidth(text, 20) + 5 * (text.length - 1)
    );
  });
});

describe("linesNeeded", () => {
  it("counts a single word wider than the box as one line", () => {
    // The renderer does not break words, so neither does the estimate.
    expect(linesNeeded("Lakshminarayanan", 10, 40)).toBe(1);
  });

  it("treats a box with no width as a single line", () => {
    expect(linesNeeded("anything at all", 0, 20)).toBe(1);
  });
});
