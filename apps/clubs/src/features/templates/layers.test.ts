import { describe, expect, it } from "vitest";

import {
  CERTIFICATE_TOKENS,
  TICKET_TOKENS,
  clampToCanvas,
  layerLabel,
  newLayer,
  toArtwork,
  withSampleValues,
} from "./layers";

/**
 * The geometry behind the editor.
 *
 * All of it fails as a layer in the wrong place rather than an error, and the
 * wrong place only shows up in a PDF someone has already emailed out.
 */
describe("screen to artwork", () => {
  it("scales a drag by the zoom", () => {
    // At 50% a 10px drag has to move the layer 20 artwork pixels, or layers
    // drift away from the cursor the further you zoom out.
    expect(toArtwork(10, 0.5)).toBe(20);
    expect(toArtwork(10, 2)).toBe(5);
    expect(toArtwork(10, 1)).toBe(10);
  });

  it("refuses to divide by a zero or broken scale", () => {
    expect(toArtwork(10, 0)).toBe(0);
    expect(toArtwork(10, Number.NaN)).toBe(0);
  });
});

describe("clamping", () => {
  const canvas = { width: 1000, height: 600 };

  it("keeps a layer inside the artwork", () => {
    expect(clampToCanvas({ x: -40, y: -10 }, canvas)).toEqual({ x: 0, y: 0 });
    expect(clampToCanvas({ x: 5000, y: 5000 }, canvas)).toEqual({ x: 999, y: 599 });
  });

  it("rounds to whole pixels, since the renderer takes integers", () => {
    expect(clampToCanvas({ x: 10.6, y: 20.2 }, canvas)).toEqual({ x: 11, y: 20 });
  });

  it("does not clamp against an unmeasured canvas", () => {
    // Before the artwork loads its size is 0x0; clamping to that would stack
    // every layer at the origin.
    expect(clampToCanvas({ x: 400, y: 300 }, { width: 0, height: 0 })).toEqual({
      x: 400,
      y: 300,
    });
  });
});

describe("sample values", () => {
  it("substitutes known tokens", () => {
    expect(withSampleValues("Hi {{name}}", TICKET_TOKENS)).toBe("Hi Lorem Ipsum");
  });

  it("replaces every occurrence, not just the first", () => {
    expect(withSampleValues("{{name}} and {{name}}", TICKET_TOKENS)).toBe(
      "Lorem Ipsum and Lorem Ipsum"
    );
  });

  it("leaves an unknown token visible, matching the renderer", () => {
    // A typo that renders as blank space is the version nobody notices until
    // it has been emailed to everyone.
    expect(withSampleValues("{{even_name}}", TICKET_TOKENS)).toBe("{{even_name}}");
  });

  it("offers placing on certificates and ticket_code on tickets, not both", () => {
    const certs = CERTIFICATE_TOKENS.map((t) => t.token);
    const tickets = TICKET_TOKENS.map((t) => t.token);
    expect(certs).toContain("placing");
    expect(certs).not.toContain("ticket_code");
    expect(tickets).toContain("ticket_code");
  });
});

describe("new layers", () => {
  it("lands inside the artwork rather than under its corner", () => {
    const layer = newLayer("text", { width: 1000, height: 600 });
    expect(layer.x).toBeGreaterThan(0);
    expect(layer.y).toBeGreaterThan(0);
    expect(layer.x).toBeLessThan(1000);
  });

  it("gives each layer a distinct id", () => {
    const canvas = { width: 800, height: 600 };
    const ids = new Set([newLayer("text", canvas).id, newLayer("text", canvas).id]);
    expect(ids.size).toBe(2);
  });

  it("starts a QR layer with a size, since it has no text to measure", () => {
    expect(newLayer("qr", { width: 800, height: 600 }).width).toBeGreaterThan(0);
  });
});

describe("layer labels", () => {
  it("falls back to the text, then to a placeholder", () => {
    const base = newLayer("text", { width: 800, height: 600 });
    expect(layerLabel({ ...base, text: "{{name}}" })).toBe("{{name}}");
    expect(layerLabel({ ...base, text: "   " })).toBe("Empty text");
    expect(layerLabel({ ...base, name: "Delegate" })).toBe("Delegate");
  });
});
