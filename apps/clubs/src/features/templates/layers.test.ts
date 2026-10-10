import { describe, expect, it } from "vitest";

import {
  CERTIFICATE_TOKENS,
  LAYER_TYPES,
  TICKET_TOKENS,
  centreOnCanvas,
  clampToCanvas,
  duplicateLayer,
  effectiveWeight,
  layerLabel,
  layerSchema,
  layerTypeLabel,
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

  it("uses a real attendee's values when the designer has them", () => {
    // What "Sample preview" was missing: the actual person, not Lorem Ipsum.
    const out = withSampleValues("{{name}} · {{venue}}", TICKET_TOKENS, {
      name: "Lakshminarayanan Venkataraman",
      venue: "Innovation Hall",
    });

    expect(out).toBe("Lakshminarayanan Venkataraman · Innovation Hall");
  });

  it("falls back to the placeholder for a value the server did not send", () => {
    // A key missing from the map must not print as braces.
    const out = withSampleValues("{{name}} / {{ticket_code}}", TICKET_TOKENS, {
      name: "Aisha",
    });

    expect(out).toBe("Aisha / MOA-2048");
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


describe("every layer type", () => {
  const canvas = { width: 1000, height: 600 };

  it.each(LAYER_TYPES)("creates a complete %s layer", (type) => {
    // The schema is what the API validates against, so a new layer missing a
    // field fails on save rather than on add -- after the design is done.
    expect(layerSchema.safeParse(newLayer(type, canvas)).success).toBe(true);
  });

  it.each(LAYER_TYPES)("names a new %s layer in the list", (type) => {
    expect(layerLabel(newLayer(type, canvas))).not.toBe("");
    expect(layerTypeLabel(type)).not.toBe("");
  });

  it("gives an image layer a size, since it has no text to measure", () => {
    const layer = newLayer("image", canvas);

    expect(layer.width).toBeGreaterThan(0);
    expect(layer.height).toBeGreaterThan(0);
  });

  it("gives a shape a visible fill from the moment it is added", () => {
    // A transparent rectangle looks like nothing happened.
    expect(newLayer("shape", canvas).fill).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("starts a text layer on a token rather than empty", () => {
    expect(newLayer("text", canvas).text).toContain("{{");
  });
});

describe("font weight", () => {
  const base = newLayer("text", { width: 1000, height: 600 });

  it("prefers an explicit weight over bold", () => {
    // A config may carry either; the renderer prefers weight, and the preview
    // has to agree with it about which one wins.
    expect(effectiveWeight({ ...base, weight: 300, bold: true })).toBe(300);
  });

  it("falls back to bold for configs saved before weights existed", () => {
    expect(effectiveWeight({ ...base, weight: null, bold: true })).toBe(700);
    expect(effectiveWeight({ ...base, weight: null, bold: false })).toBe(400);
  });
});

describe("the schema's defaults", () => {
  it("opens a layer saved before the new controls existed", () => {
    // What is actually in the database: no opacity, no overflow, no weight.
    const legacy = {
      id: "a",
      type: "text",
      text: "{{name}}",
      x: 10,
      y: 20,
      width: 400,
      font_size: 30,
      color: "#ffffff",
      align: "left",
      bold: true,
      max_lines: 1,
      line_spacing: 4,
    };

    const parsed = layerSchema.parse(legacy);

    // Defaults have to reproduce the old rendering, not introduce a new look.
    expect(parsed.opacity).toBe(100);
    expect(parsed.hidden).toBe(false);
    expect(parsed.locked).toBe(false);
    expect(parsed.letter_spacing).toBe(0);
    expect(parsed.radius).toBe(0);
    expect(effectiveWeight(parsed)).toBe(700);
  });

  it("rejects an opacity the API would reject", () => {
    const base = newLayer("text", { width: 1000, height: 600 });

    expect(layerSchema.safeParse({ ...base, opacity: 140 }).success).toBe(false);
    expect(layerSchema.safeParse({ ...base, weight: 950 }).success).toBe(false);
    expect(layerSchema.safeParse({ ...base, radius: -1 }).success).toBe(false);
  });
});


describe("duplicating a layer", () => {
  const canvas = { width: 1000, height: 600 };

  it("gives the copy its own id", () => {
    // A shared id makes the editor edit both at once, and the renderer keep
    // only one of them.
    const layer = newLayer("text", canvas);

    expect(duplicateLayer(layer, canvas).id).not.toBe(layer.id);
  });

  it("offsets the copy so it is visibly a second layer", () => {
    const layer = { ...newLayer("text", canvas), x: 100, y: 100 };

    const copy = duplicateLayer(layer, canvas);

    expect(copy.x).toBeGreaterThan(layer.x);
    expect(copy.y).toBeGreaterThan(layer.y);
  });

  it("keeps the copy inside the artwork", () => {
    // Duplicating a layer at the bottom-right corner must not push it out
    // of view, where it cannot be selected again.
    const layer = { ...newLayer("text", canvas), x: 995, y: 595 };

    const copy = duplicateLayer(layer, canvas);

    expect(copy.x).toBeLessThan(canvas.width);
    expect(copy.y).toBeLessThan(canvas.height);
  });

  it("carries the styling over", () => {
    const layer = {
      ...newLayer("text", canvas),
      font_size: 44,
      color: "#ff5a1f",
      letter_spacing: 6,
    };

    expect(duplicateLayer(layer, canvas)).toMatchObject({
      font_size: 44,
      color: "#ff5a1f",
      letter_spacing: 6,
    });
  });

  it("does not lock the copy", () => {
    // It was created to be moved; unlocking it first would be a dead step.
    const layer = { ...newLayer("text", canvas), locked: true };

    expect(duplicateLayer(layer, canvas).locked).toBe(false);
  });

  it("names the copy after the original", () => {
    const layer = { ...newLayer("text", canvas), name: "Attendee name" };

    expect(duplicateLayer(layer, canvas).name).toBe("Attendee name copy");
  });
});

describe("centring on the artwork", () => {
  const canvas = { width: 1000, height: 600 };

  it("centres a layer across by its own width", () => {
    const layer = { ...newLayer("text", canvas), width: 400 };

    expect(centreOnCanvas(layer, canvas, "x")).toEqual({ x: 300 });
  });

  it("centres a layer down by its own height", () => {
    const layer = { ...newLayer("shape", canvas), height: 100 };

    expect(centreOnCanvas(layer, canvas, "y")).toEqual({ y: 250 });
  });

  it("centres a QR layer down by its size, since it is square", () => {
    const layer = { ...newLayer("qr", canvas), width: 200, height: null };

    expect(centreOnCanvas(layer, canvas, "y")).toEqual({ y: 200 });
  });

  it("declines rather than guessing a box it does not have", () => {
    // An auto-width text layer has no measured width here, so centring it
    // would move it somewhere the organiser did not ask for.
    const layer = { ...newLayer("text", canvas), width: null };

    expect(centreOnCanvas(layer, canvas, "x")).toBeNull();
  });

  it("declines on an unmeasured canvas", () => {
    const layer = { ...newLayer("text", canvas), width: 400 };

    expect(centreOnCanvas(layer, { width: 0, height: 0 }, "x")).toBeNull();
  });
});
