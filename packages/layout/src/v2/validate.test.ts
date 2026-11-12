import { describe, expect, it } from "vitest";

import { minimal, textRaw } from "./test-utils";
import { canSave, errorsV2, validate } from "./validate";

const qr = (more: Record<string, unknown> = {}) => ({ kind: "qr", id: "qr", name: "QR code", x: 200, y: 400, width: 120, height: 120, ...more });
const codes = (raw: unknown, kind = "ticket") => validate(raw, kind).map((p) => p.code);

describe("a v2 layout's meaning", () => {
  it("passes a ticket with its QR", () => {
    expect(validate(minimal([textRaw(), qr()]), "ticket")).toEqual([]);
    expect(canSave(validate(minimal([textRaw(), qr()]), "ticket"))).toBe(true);
  });

  it("asks a ticket and a badge for their QR, never a certificate; one at most", () => {
    expect(validate(minimal([textRaw()]), "ticket")).toEqual([{ code: "qr_missing", field: "layers", message: "This design needs its QR code: it is what the gate scans.", level: "error" }]);
    expect(codes(minimal([textRaw()]), "badge")).toEqual(["qr_missing"]);
    expect(codes(minimal([textRaw()]), "certificate")).toEqual([]);
    expect(validate(minimal([qr(), qr({ id: "qr2" })]))).toEqual([{ code: "qr_extra", field: "layers.1", message: "A design has one QR code.", level: "error", layer: "qr2" }]);
  });

  it("wants the canvas the shape of the page", () => {
    expect(validate({ ...minimal([qr()]), canvas: { width: 400, height: 576 } })[0]).toEqual({
      code: "page_shape", field: "canvas", level: "error",
      message: "The canvas is 400 × 576, which is not the shape of a 101.6 × 152.4 mm page. Resize it, or change the page.",
    });
    // Within 1.5% is the same shape.
    expect(codes({ ...minimal([qr()]), canvas: { width: 389, height: 576 } })).toEqual([]);
  });

  it("refuses two layers with one id, and an unknown token in showIf", () => {
    expect(validate(minimal([qr(), textRaw({ id: "qr" })]))).toContainEqual({ code: "duplicate_id", field: "layers.1.id", message: 'Two layers share the id "qr".', level: "error", layer: "qr" });
    expect(validate(minimal([qr(), textRaw({ showIf: "organization gate|nope" })]))).toEqual([
      { code: "unknown_token", field: "layers.1.showIf", message: "Name: nope is not a token.", level: "error", layer: "t1" },
    ]);
    // A design token is a token only on its own kind.
    expect(codes(minimal([qr(), textRaw({ showIf: "bib_number" })]), "badge")).toEqual([]);
    expect(codes(minimal([qr(), textRaw({ showIf: "bib_number" })]), "ticket")).toEqual(["unknown_token"]);
    expect(codes(minimal([qr(), textRaw({ showIf: "field.t_shirt_size" })]))).toEqual([]);
  });

  it("warns of a layer off the canvas, unless it is turned", () => {
    expect(validate(minimal([qr(), textRaw({ x: 400 })]))).toEqual([{ code: "off_canvas", field: "layers.1.x", message: "Name: this layer is outside the canvas.", level: "warning", layer: "t1" }]);
    expect(codes(minimal([qr(), textRaw({ x: 400, rotation: 10 })]))).toEqual([]);
  });

  it("names fonts that do not exist, and faces a family lacks", () => {
    expect(validate(minimal([qr(), textRaw({ font: { family: "Intr" } })]))).toEqual([
      { code: "unknown_font", field: "layers.1.font.family", message: "Name: there is no font called 'Intr'. The nearest are Inter, Anton, Lato.", level: "error", layer: "t1" },
    ]);
    expect(validate(minimal([qr(), textRaw({ font: { family: "EB Garamond", weight: 700 } })]))).toEqual([
      { code: "font_face", field: "layers.1.font.weight", message: "Name: EB Garamond has 400 italic, 400, 500, not 700.", level: "error", layer: "t1" },
    ]);
    expect(validate(minimal([qr(), textRaw({ font: { family: "Inter", style: "italic" } })]))[0]!.message).toBe("Name: Inter has 400, 500, 600, 700, not 400 italic.");
    // v1's keys are not CSS names: fromV1 maps them.
    expect(codes(minimal([qr(), textRaw({ font: { family: "inter" } })]))).toEqual(["unknown_font"]);
  });

  it("checks a span's own face, and each span's template", () => {
    const raw = minimal([qr(), textRaw({ spans: [{ text: "{{nmae}}" }, { text: "x", weight: 300 }] })]);
    expect(validate(raw)).toEqual([
      { code: "template", field: "layers.1.spans.0.text", message: "Name: {{nmae}} is not a token. Did you mean {{name}}?", level: "error", layer: "t1" },
      { code: "font_face", field: "layers.1.spans.1.weight", message: "Name: Inter has 400, 500, 600, 700, not 300.", level: "error", layer: "t1" },
    ]);
  });

  it("names every template mistake, and warns of text that says nothing", () => {
    expect(validate(minimal([qr(), textRaw({ text: "{% if name %}{{name | shout}}" })])).map((p) => p.message)).toEqual([
      'Name: "shout" is not a filter. Use upper, lower, title.',
      "Name: An {% if %} is never closed with {% endif %}.",
    ]);
    expect(validate(minimal([qr(), textRaw({ text: " " })]))).toEqual([{ code: "empty_text", field: "layers.1.text", message: "Name: this text says nothing.", level: "warning", layer: "t1" }]);
  });

  it("warns of a shape with nothing to draw", () => {
    expect(validate(minimal([qr(), { kind: "shape", id: "s", name: "Box", x: 0, y: 0, width: 10, height: 10 }]))).toEqual([
      { code: "invisible", field: "layers.1.fill", message: "Box: a shape needs a fill or an outline.", level: "warning", layer: "s" },
    ]);
    expect(codes(minimal([qr(), { kind: "shape", id: "s", name: "Box", x: 0, y: 0, width: 10, height: 10, shadow: { blur: 3 } }]))).toEqual([]);
  });

  it("refuses SVG that is not one drawing, and warns of what it had to remove", () => {
    const svg = (markup: string) => minimal([qr(), { kind: "svg", id: "v", name: "Art", x: 0, y: 0, width: 10, height: 10, markup }]);
    expect(validate(svg("<g><rect/></g> plain"))).toEqual([{ code: "svg_unsafe", field: "layers.1.markup", message: "Art: an svg layer holds one <svg> element.", level: "error", layer: "v" }]);
    expect(validate(svg('<svg viewBox="0 0 1 1" onload="x()"><script>alert(1)</script><rect/></svg>'))).toEqual([
      { code: "svg_cleaned", field: "layers.1.markup", message: "Art: removed what a design may not hold: onload on <svg>, <script>.", level: "warning", layer: "v" },
    ]);
    expect(codes(svg("<svg><rect/></svg>"))).toEqual(["svg_unsafe"]);
  });

  it("wants an upload chosen, and no guest photo on the stock", () => {
    expect(validate(minimal([qr(), { kind: "image", id: "i", name: "Logo", x: 0, y: 0, width: 10, height: 10 }]))).toEqual([
      { code: "image_missing", field: "layers.1.imageKey", message: "Logo: choose an image to show.", level: "error", layer: "i" },
    ]);
    expect(codes(minimal([qr(), { kind: "image", id: "i", name: "Logo", x: 0, y: 0, width: 10, height: 10, hidden: true }]))).toEqual([]);
    expect(validate(minimal([qr(), { kind: "image", id: "i", name: "Photo", x: 0, y: 0, width: 10, height: 10, source: "guest_photo", preprinted: true }]))).toEqual([
      { code: "photo_preprinted", field: "layers.1.preprinted", message: "Photo: a guest photo cannot be on the card stock.", level: "error", layer: "i" },
    ]);
    expect(codes(minimal([qr(), { kind: "image", id: "i", name: "Photo", x: 0, y: 0, width: 10, height: 10, source: "guest_photo", placeholderStyle: { family: "Comic" } }]))).toEqual(["unknown_font"]);
  });

  it("keeps the QR printed, large enough, square and on the page", () => {
    expect(validate(minimal([qr({ hidden: true })]))).toEqual([{ code: "qr_hidden", field: "layers.0.hidden", message: "QR code: the QR code is always printed.", level: "error", layer: "qr" }]);
    expect(codes(minimal([qr({ showIf: "seat" })]))).toEqual(["qr_hidden"]);
    // 384 px is 101.6 mm: 3.78 px a mm. 30 px is 8 mm; 45 px, 12 mm.
    expect(validate(minimal([qr({ width: 30, height: 30 })]))).toEqual([
      { code: "qr_small", field: "layers.0.width", message: "QR code: 8 mm on paper; at least 10 mm, or phones struggle to read it.", level: "error", layer: "qr" },
    ]);
    expect(validate(minimal([qr({ width: 45, height: 45 })]))).toEqual([{ code: "qr_small", field: "layers.0.width", message: "QR code: 12 mm on paper; 15 mm or more scans best.", level: "warning", layer: "qr" }]);
    expect(validate(minimal([qr({ height: 130 })]))).toEqual([{ code: "qr_square", field: "layers.0.height", message: "QR code: a QR code is square.", level: "warning", layer: "qr" }]);
    expect(validate(minimal([qr({ x: 300 })]))).toEqual([{ code: "qr_outside", field: "layers.0.x", message: "QR code: the whole QR code must be on the page.", level: "error", layer: "qr" }]);
  });

  it("wants an accent when colours say var:accent", () => {
    expect(validate(minimal([qr(), textRaw({ color: "var:accent" })]))).toEqual([
      { code: "accent_missing", field: "vars.accent", message: "Colours say var:accent, but the design has no accent colour.", level: "error" },
    ]);
    expect(codes({ ...minimal([qr(), textRaw({ background: { type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "var:accent" }] } })]), vars: { accent: "#FF8A3D" } })).toEqual([]);
    expect(errorsV2(minimal([qr(), textRaw({ color: "var:accent", x: 999 })])).map((p) => p.code)).toEqual(["accent_missing"]);
  });
});

describe("a v2 layout's shape, in pydantic's words", () => {
  it("names the field and says what is wrong", () => {
    expect(validate({ ...minimal(), version: 3 })).toEqual([{ code: "schema", field: "version", message: "Input should be 2", level: "error" }]);
    expect(validate({ version: 2, canvas: { width: 384, height: 576 } })).toEqual([{ code: "schema", field: "page", message: "Field required", level: "error" }]);
    expect(validate({ ...minimal(), canvas: { width: 200, height: 576 } })[0]).toMatchObject({ field: "canvas.width", message: "Input should be greater than or equal to 300" });
    expect(validate(minimal([textRaw({ width: 0 })]))[0]).toMatchObject({ field: "layers.0.width", message: "Input should be greater than 0" });
    expect(validate(minimal([textRaw({ maxLines: 2.5 })]))[0]).toMatchObject({ field: "layers.0.maxLines", message: "Input should be a valid integer, got a number with a fractional part" });
    expect(validate(minimal([textRaw({ align: "justify" })]))[0]).toMatchObject({ field: "layers.0.align", message: "Input should be 'left', 'center' or 'right'" });
    expect(validate(minimal([textRaw({ colour: "#000000" })]))[0]).toMatchObject({ field: "layers.0.colour", message: "Extra inputs are not permitted" });
    expect(validate(minimal([textRaw({ color: "red" })]))[0]).toMatchObject({ field: "layers.0.color", message: "String should have at least 4 characters" });
    expect(validate(minimal([textRaw({ color: "crimson" })]))[0]).toMatchObject({ field: "layers.0.color", message: "color: use #RRGGBB, #RRGGBBAA, var:accent, brand.primary, brand.secondary or ticket_type" });
    expect(validate(minimal([textRaw({ id: "a b" })]))[0]).toMatchObject({ field: "layers.0.id", message: "String should match pattern '^[A-Za-z0-9_-]{1,40}$'" });
    expect(validate(minimal([textRaw({ name: " " })]))[0]).toMatchObject({ field: "layers.0.name", message: "Give the layer a name." });
    expect(validate(minimal([textRaw({ padding: [1, 2] })]))[0]).toMatchObject({ field: "layers.0.padding", message: "padding: four numbers, or one" });
  });

  it("names a union's member as the backend does: by the layer, not its kind", () => {
    expect(validate(minimal([{ ...textRaw(), kind: "agenda" }]))[0]).toMatchObject({
      field: "layers.0", message: "Input tag 'agenda' found using 'kind' does not match any of the expected tags: 'text', 'shape', 'svg', 'image', 'qr'",
    });
    expect(validate(minimal([textRaw({ background: { type: "conic" } })]))[0]).toMatchObject({ field: "layers.0.background" });
    expect(validate(minimal([textRaw({ background: { type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }] } })]))[0]).toMatchObject({
      field: "layers.0.background.stops", message: "List should have at least 2 items after validation, not 1",
    });
  });
});
