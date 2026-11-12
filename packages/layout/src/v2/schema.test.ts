import { describe, expect, it } from "vitest";

import { DOC_FONTS, findFont, fontsAvailable, fontsCssUrl, nearestFace, nearestFonts, V1_FONT_FAMILY } from "./fonts";
import { minimal, textRaw } from "./test-utils";
import { dumpLayoutV2, type ImageLayerV2, isV2Layout, type QrLayerV2, type ShapeLayerV2, type SvgLayerV2, type TextLayerV2, layerV2, LayoutV2, parseLayoutV2, pyRepr, pyRound, shadowsOf, textFloor, V2_LIMITS } from "./schema";

describe("the v2 schema accepts", () => {
  it("a minimal layout, filling every default as the backend does", () => {
    const l = parseLayoutV2(minimal([textRaw()]));
    expect(l.version).toBe(2);
    expect(l.vars.accent).toBeNull();
    expect(l.canvas.background).toBeNull();
    expect(l.starter).toBeNull();
    expect(l.layers[0]).toMatchObject({
      rotation: 0, opacity: 1, hidden: false, locked: false, showIf: null, preprinted: false, shadow: null,
      font: { family: "Inter", weight: 400, style: "normal" }, color: "#141614", letterSpacing: 0, lineHeight: 1.2,
      align: "left", valign: "top", transform: "none", textWrap: "normal", maxLines: 1, fit: "shrink", minSize: null,
      background: null, padding: [0, 0, 0, 0], radius: [0, 0, 0, 0], spans: null,
    });
    expect(parseLayoutV2({ page: { widthMm: 101.6, heightMm: 152.4 }, canvas: { width: 384, height: 576 } }).layers).toEqual([]);
  });

  it("every kind, every fill and every colour form, colours upper-cased", () => {
    const stops = [{ offset: 0, color: "var:accent" }, { offset: 1, color: "#00000080" }];
    const l = parseLayoutV2({
      ...minimal([
        textRaw({ color: "#ff8a3d", background: { type: "linear", angle: 135, stops }, padding: [1, 2, 3, 4], radius: 6, shadow: { y: 2, blur: 8 } }),
        { kind: "shape", id: "s1", name: "Box", x: 0, y: 0, width: 10, height: 10, fill: { type: "radial", stops }, stroke: { color: "brand.primary", width: 2, dash: [4, 2] }, radius: [1, 2, 3, 4] },
        { kind: "shape", id: "s2", name: "Blob", x: 0, y: 0, width: 10, height: 10, shape: "path", path: "M0 0  L10 0\nq0 10 -10 10 z", fill: { type: "solid", color: "ticket_type" } },
        { kind: "svg", id: "v1", name: "Art", x: 0, y: 0, width: 10, height: 10, markup: "<svg viewBox='0 0 1 1'><rect fill='#FF8A3D' width='1' height='1'/></svg>", recolor: { "#ff8a3d": "var:accent" } },
        { kind: "image", id: "i1", name: "Photo", x: 0, y: 0, width: 10, height: 10, source: "guest_photo", fit: "cover", border: { color: "#ffffff", width: 3 }, placeholder: "initials", placeholderStyle: {} },
        { kind: "qr", id: "q1", name: "QR", x: 0, y: 0, width: 100, height: 100, light: "#ffffff" },
      ]),
      canvas: { width: 384, height: 576, background: { type: "solid", color: "brand.secondary" } },
      vars: { accent: "#1f3bd8" },
      starter: "badge/06-thermal-mono",
    });
    expect(l.layers.map((x) => x.kind)).toEqual(["text", "shape", "shape", "svg", "image", "qr"]);
    expect(l.vars.accent).toBe("#1F3BD8");
    const [t, s1, s2, v, i, q] = l.layers as unknown as [TextLayerV2, ShapeLayerV2, ShapeLayerV2, SvgLayerV2, ImageLayerV2, QrLayerV2];
    expect(t.color).toBe("#FF8A3D");
    expect(t.radius).toEqual([6, 6, 6, 6]);
    expect(t.shadow).toEqual({ x: 0, y: 2, blur: 8, spread: 0, color: "#00000040", inset: false });
    expect(s1.fill).toEqual({ type: "radial", cx: 0.5, cy: 0.5, stops: [{ offset: 0, color: "var:accent" }, { offset: 1, color: "#00000080" }] });
    expect(s2.path).toBe("M0 0 L10 0 q0 10 -10 10 z");
    expect(v.recolor).toEqual({ "#FF8A3D": "var:accent" });
    expect(i).toMatchObject({ align: "center", valign: "middle", placeholder: "initials", border: { color: "#FFFFFF", width: 3 } });
    expect(i.placeholderStyle).toEqual({ color: "#3C4257", background: null, family: "Inter", weight: 700 });
    expect([q.dark, q.light, q.quietZone]).toEqual(["#000000", "#FFFFFF", 0]);
  });

  it("spans as the text, and minSize never above the size", () => {
    const t = parseLayoutV2(minimal([textRaw({ spans: [{ text: "for " }, { text: "{{event_name}}", weight: 700 }], minSize: 50 })])).layers[0] as TextLayerV2;
    expect(t.text).toBe("for {{event_name}}");
    expect(t.spans?.[1]).toEqual({ text: "{{event_name}}", family: null, weight: 700, style: null, size: null, color: null, letterSpacing: null, transform: null });
    expect(t.minSize).toBe(32);
    expect((parseLayoutV2(minimal([textRaw({ spans: [] })])).layers[0] as TextLayerV2).spans).toBeNull();
  });

  it("one shadow or a list of them; an empty list is none", () => {
    const l = parseLayoutV2(minimal([textRaw({ shadow: [{ x: 1 }, { y: 2, inset: true }] }), textRaw({ id: "t2", shadow: [] })]));
    expect(shadowsOf(l.layers[0]!)).toHaveLength(2);
    expect(l.layers[1]!.shadow).toBeNull();
  });

  it("a showIf of one, all or any tokens, trimmed; blank is none", () => {
    const l = parseLayoutV2(minimal([textRaw({ showIf: " organization " }), textRaw({ id: "b", showIf: "row seat" }), textRaw({ id: "c", showIf: "gate|row" }), textRaw({ id: "d", showIf: "  " })]));
    expect(l.layers.map((x) => x.showIf)).toEqual(["organization", "row seat", "gate|row", null]);
  });

  it("the shrink floor: minSize, else half the size rounded as Python rounds", () => {
    expect(textFloor({ minSize: 9, size: 30 })).toBe(9);
    expect(textFloor({ minSize: null, size: 31 })).toBe(15.5);
    expect(pyRound(0.0625, 3)).toBe(0.062);
    expect(pyRound(0.1875, 3)).toBe(0.188);
    expect(pyRound(2.675, 2)).toBe(2.67);
    expect(pyRound(-0.0625, 3)).toBe(-0.062);
    expect(layerV2({ kind: "text", id: "a", name: "A", x: 0, y: 0, width: 1, height: 1 }).size).toBe(16);
  });

  it("dumps without nulls, as the backend's dump", () => {
    const d = dumpLayoutV2(parseLayoutV2(minimal([textRaw()]))) as { vars: unknown; layers: Record<string, unknown>[] };
    expect(d.vars).toEqual({});
    expect("showIf" in d.layers[0]!).toBe(false);
    expect(isV2Layout(d)).toBe(true);
    expect(isV2Layout({ version: 2 })).toBe(false);
  });
});

describe("the v2 schema refuses", () => {
  const bad = (raw: unknown) => LayoutV2.safeParse(raw);
  it.each([
    ["version 1", { ...minimal(), version: 1 }],
    ["an unknown field", { ...minimal(), colour: "red" }],
    ["an unknown layer field", minimal([textRaw({ fontSize: 3 })])],
    ["a canvas under 300 px", { ...minimal(), canvas: { width: 299, height: 576 } }],
    ["a canvas over 3000 px", { ...minimal(), canvas: { width: 384, height: 3001 } }],
    ["a page under 20 mm", { ...minimal(), page: { widthMm: 19, heightMm: 152.4 } }],
    ["a three-digit colour", minimal([textRaw({ color: "#FFF" })])],
    ["a named colour", minimal([textRaw({ color: "crimson" })])],
    ["an accent with alpha", { ...minimal(), vars: { accent: "#FF8A3D80" } }],
    ["a gradient with one stop", minimal([textRaw({ background: { type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }] } })])],
    ["a gradient with seven stops", minimal([textRaw({ background: { type: "linear", angle: 0, stops: Array.from({ length: 7 }, (_, i) => ({ offset: i / 6, color: "#000000" })) } })])],
    ["a fill with no type", minimal([textRaw({ background: { color: "#000000" } })])],
    ["a stop past 1", minimal([textRaw({ background: { type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1.2, color: "#000000" }] } })])],
    ["opacity over 1", minimal([textRaw({ opacity: 1.5 })])],
    ["a weight off the scale", minimal([textRaw({ font: { family: "Inter", weight: 950 } })])],
    ["an oblique style", minimal([textRaw({ font: { family: "Inter", style: "oblique" } })])],
    ["maxLines 21", minimal([textRaw({ maxLines: 21 })])],
    ["an unknown fit", minimal([textRaw({ fit: "squash" })])],
    ["text past 2000 characters", minimal([textRaw({ text: "x".repeat(V2_LIMITS.maxText + 1) })])],
    ["41 spans", minimal([textRaw({ spans: Array.from({ length: 41 }, () => ({ text: "a" })) })])],
    ["a padding of three sides", minimal([textRaw({ padding: [1, 2, 3] })])],
    ["a negative radius", minimal([textRaw({ radius: -1 })])],
    ["a radius over 5000", minimal([textRaw({ radius: 5001 })])],
    ["a zero-width layer", minimal([textRaw({ width: 0 })])],
    ["a layer past 10000 px", minimal([textRaw({ x: 10_001 })])],
    ["a bad id", minimal([textRaw({ id: "has space" })])],
    ["an id of 41 characters", minimal([textRaw({ id: "a".repeat(41) })])],
    ["an empty name", minimal([textRaw({ name: "  " })])],
    ["a name of 61 characters", minimal([textRaw({ name: "n".repeat(61) })])],
    ["an unknown kind", minimal([{ ...textRaw(), kind: "agenda" }])],
    ["seven shadows", minimal([textRaw({ shadow: Array.from({ length: 7 }, () => ({})) })])],
    ["a showIf with braces", minimal([textRaw({ showIf: "{{organization}}" })])],
    ["a path not starting with M", minimal([{ kind: "shape", id: "s", name: "S", x: 0, y: 0, width: 1, height: 1, shape: "path", path: "L0 0" }])],
    ["a path with a stray letter", minimal([{ kind: "shape", id: "s", name: "S", x: 0, y: 0, width: 1, height: 1, shape: "path", path: "M0 0 X1 1" }])],
    ["a path shape without its path", minimal([{ kind: "shape", id: "s", name: "S", x: 0, y: 0, width: 1, height: 1, shape: "path" }])],
    ["a dash of one number", minimal([{ kind: "shape", id: "s", name: "S", x: 0, y: 0, width: 1, height: 1, stroke: { color: "#000000", width: 1, dash: [4] } }])],
    ["a dash of two zeros", minimal([{ kind: "shape", id: "s", name: "S", x: 0, y: 0, width: 1, height: 1, stroke: { color: "#000000", width: 1, dash: [0, 0] } }])],
    ["a stroke of width 0", minimal([{ kind: "shape", id: "s", name: "S", x: 0, y: 0, width: 1, height: 1, stroke: { color: "#000000", width: 0 } }])],
    ["a coloured QR", minimal([{ kind: "qr", id: "q", name: "Q", x: 0, y: 0, width: 100, height: 100, dark: "#1F3BD8" }])],
    ["a QR quiet zone of 5", minimal([{ kind: "qr", id: "q", name: "Q", x: 0, y: 0, width: 100, height: 100, quietZone: 5 }])],
    ["an unknown image source", minimal([{ kind: "image", id: "i", name: "I", x: 0, y: 0, width: 1, height: 1, source: "gravatar" }])],
    ["SVG markup under 10 characters", minimal([{ kind: "svg", id: "v", name: "V", x: 0, y: 0, width: 1, height: 1, markup: "<svg/>" }])],
    ["SVG markup past 60000 characters", minimal([{ kind: "svg", id: "v", name: "V", x: 0, y: 0, width: 1, height: 1, markup: "x".repeat(60_001) }])],
    ["a recolour key that is not a colour", minimal([{ kind: "svg", id: "v", name: "V", x: 0, y: 0, width: 1, height: 1, markup: "<svg viewBox='0 0 1 1'/>", recolor: { red: "#000000" } }])],
    ["33 recolours", minimal([{ kind: "svg", id: "v", name: "V", x: 0, y: 0, width: 1, height: 1, markup: "<svg viewBox='0 0 1 1'/>", recolor: Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`#0000${String(i).padStart(2, "0")}`, "#000000"])) }])],
    ["151 layers", minimal(Array.from({ length: 151 }, (_, i) => textRaw({ id: `t${i}` })))],
  ])("%s", (_, raw) => {
    expect(bad(raw).success).toBe(false);
  });
});

describe("the v2 font list", () => {
  it("holds the lock's 37 families: the 34 doc fonts and the v1 three it gained", () => {
    expect(DOC_FONTS).toHaveLength(37);
    for (const family of Object.values(V1_FONT_FAMILY)) expect(findFont(family)).not.toBeNull();
    expect(findFont("bebas")).toBeNull();
    expect(findFont("Cormorant Garamond")?.normal).toEqual([]);
  });

  it("lists faces as the API does: italic first, the v1 key beside the family", () => {
    const eb = fontsAvailable().find((f) => f.family === "EB Garamond")!;
    expect(eb.faces).toEqual([{ weight: 400, style: "italic" }, { weight: 400, style: "normal" }, { weight: 500, style: "normal" }]);
    expect(fontsAvailable().find((f) => f.family === "Roboto Mono")!.v1).toBe("mono");
  });

  it("names the nearest families for a typo: same first three letters first", () => {
    expect(nearestFonts("Intr")).toEqual(["Inter", "Anton", "Lato"]);
    expect(nearestFonts("Garamond")).toEqual(["EB Garamond", "Anton", "Barlow"]);
    expect(nearestFonts("Barlo")).toEqual(["Barlow", "Barlow Condensed", "Karla"]);
  });

  it("picks the face a browser would", () => {
    const inter = findFont("Inter")!;
    expect(nearestFace(inter, 800, "normal")).toEqual({ weight: 700, style: "normal" });
    expect(nearestFace(findFont("Cormorant Garamond")!, 500, "normal")).toEqual({ weight: 500, style: "italic" });
    expect(nearestFace(findFont("Barlow")!, 550, "normal")).toEqual({ weight: 600, style: "normal" });
  });

  it("links the backend's stylesheet", () => {
    expect(fontsCssUrl("https://api.myotherapp.in/")).toBe("https://api.myotherapp.in/static/doc-fonts/fonts.css");
    expect(fontsCssUrl("https://api.myotherapp.in", "c4c0")).toBe("https://api.myotherapp.in/static/doc-fonts/fonts.css?v=c4c0");
  });

  it("quotes as Python does", () => {
    expect(pyRepr("Intr")).toBe("'Intr'");
    expect(pyRepr("it's")).toBe('"it\'s"');
  });
});
