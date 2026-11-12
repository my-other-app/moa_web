import { describe, expect, it } from "vitest";

import { DOC_FONTS, findFont, fontsCssUrl, nearestFonts, V1_FONT_FAMILY } from "./fonts";
import { defaultMinSize, layerV2, LayoutV2, parseLayoutV2, V2_LIMITS } from "./schema";

export const minimal = (layers: unknown[] = []) => ({
  version: 2,
  page: { widthMm: 101.6, heightMm: 152.4 },
  canvas: { width: 384, height: 576 },
  layers,
});

const text = (more: Record<string, unknown> = {}) => ({ kind: "text", id: "t1", name: "Name", x: 10, y: 20, width: 200, height: 40, text: "{{attendee_name}}", font: { family: "Inter" }, size: 32, ...more });

describe("the v2 schema accepts", () => {
  it("a minimal layout, filling every default", () => {
    const l = parseLayoutV2(minimal([text()]));
    expect(l.vars.accent).toBe("#FF8A3D");
    expect(l.canvas.background).toBeNull();
    const t = l.layers[0]!;
    expect(t).toMatchObject({
      rotation: 0, opacity: 1, hidden: false, locked: false, showIf: null, preprinted: false, shadow: null,
      font: { family: "Inter", weight: 400, style: "normal" }, color: "#000000", letterSpacing: 0, lineHeight: 1.2,
      align: "left", valign: "top", transform: "none", maxLines: 1, fit: "shrink", minSize: 19, background: null,
      padding: [0, 0, 0, 0], radius: [0, 0, 0, 0],
    });
  });

  it("every kind, every fill and every colour form", () => {
    const stops = [{ offset: 0, color: "var:accent" }, { offset: 1, color: "#00000080" }];
    const l = parseLayoutV2({
      ...minimal([
        text({ background: { type: "linear", angle: 135, stops }, padding: [1, 2, 3, 4], radius: 6, shadow: { x: 0, y: 2, blur: 8, color: "#0000003D" } }),
        { kind: "shape", id: "s1", name: "Box", x: 0, y: 0, width: 10, height: 10, fill: { type: "radial", cx: 0.5, cy: 0.25, stops }, stroke: { color: "brand.primary", width: 2, dash: [4, 2] }, radius: [1, 2, 3, 4] },
        { kind: "shape", id: "s2", name: "Blob", x: 0, y: 0, width: 10, height: 10, shape: "path", path: "M0 0 L10 0 Q10 10 0 10 A5 5 0 0 1 0 0 H2 V3 C1 1 2 2 3 3 Z", fill: { type: "solid", color: "ticket_type" } },
        { kind: "svg", id: "v1", name: "Art", x: 0, y: 0, width: 10, height: 10, markup: "<svg viewBox='0 0 1 1'><rect fill='#FF8A3D' width='1' height='1'/></svg>", recolor: { "#FF8A3D": "var:accent" } },
        { kind: "image", id: "i1", name: "Photo", x: 0, y: 0, width: 10, height: 10, source: "guest_photo", fit: "cover", border: { color: "#FFFFFF", width: 3 } },
        { kind: "qr", id: "q1", name: "QR", x: 0, y: 0, width: 100, height: 100, light: "#ffffff" },
      ]),
      canvas: { width: 384, height: 576, background: { type: "solid", color: "brand.secondary" } },
      vars: { accent: "#1F3BD8" },
    });
    expect(l.layers.map((x) => x.kind)).toEqual(["text", "shape", "shape", "svg", "image", "qr"]);
    const t = l.layers[0] as Extract<(typeof l.layers)[number], { kind: "text" }>;
    expect(t.radius).toEqual([6, 6, 6, 6]);
    expect(t.shadow).toEqual({ x: 0, y: 2, blur: 8, spread: 0, color: "#0000003D" });
    const q = l.layers[5] as Extract<(typeof l.layers)[number], { kind: "qr" }>;
    expect([q.dark, q.light, q.quietZone]).toEqual(["#000000", "#FFFFFF", 2]);
    const i = l.layers[4] as Extract<(typeof l.layers)[number], { kind: "image" }>;
    expect([i.placeholder, i.imageKey]).toEqual(["initials", null]);
  });

  it("an explicit minSize, and 60% of the size when left out", () => {
    expect((parseLayoutV2(minimal([text({ minSize: 10 })])).layers[0] as { minSize: number }).minSize).toBe(10);
    expect(defaultMinSize(9)).toBe(5);
    expect(defaultMinSize(1)).toBe(1);
    expect(layerV2({ kind: "text", id: "a", name: "A", x: 0, y: 0, width: 1, height: 1, text: "", font: { family: "Inter" }, size: 50 }).minSize).toBe(30);
  });
});

describe("the v2 schema refuses", () => {
  const bad = (raw: unknown) => LayoutV2.safeParse(raw);
  it.each([
    ["version 1", { ...minimal(), version: 1 }],
    ["a canvas under 300 px", { ...minimal(), canvas: { width: 299, height: 576 } }],
    ["a canvas over 3000 px", { ...minimal(), canvas: { width: 384, height: 3001 } }],
    ["a three-digit colour", minimal([text({ color: "#FFF" })])],
    ["a named colour", minimal([text({ color: "red" })])],
    ["an accent with alpha", { ...minimal(), vars: { accent: "#FF8A3D80" } }],
    ["a gradient with one stop", minimal([text({ background: { type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }] } })])],
    ["a gradient with seven stops", minimal([text({ background: { type: "linear", angle: 0, stops: Array.from({ length: 7 }, (_, i) => ({ offset: i / 6, color: "#000000" })) } })])],
    ["a stop past 1", minimal([text({ background: { type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1.2, color: "#000000" }] } })])],
    ["a radial centre outside the box", minimal([text({ background: { type: "radial", cx: 1.5, cy: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#000000" }] } })])],
    ["opacity over 1", minimal([text({ opacity: 1.5 })])],
    ["a weight off the scale", minimal([text({ font: { family: "Inter", weight: 950 } })])],
    ["an oblique style", minimal([text({ font: { family: "Inter", style: "oblique" } })])],
    ["maxLines 21", minimal([text({ maxLines: 21 })])],
    ["an unknown fit", minimal([text({ fit: "squash" })])],
    ["text past 2000 characters", minimal([text({ text: "x".repeat(V2_LIMITS.maxText + 1) })])],
    ["a padding of three sides", minimal([text({ padding: [1, 2, 3] })])],
    ["a negative radius", minimal([text({ radius: -1 })])],
    ["a zero-width layer", minimal([text({ width: 0 })])],
    ["a bad id", minimal([text({ id: "has space" })])],
    ["an empty name", minimal([text({ name: "  " })])],
    ["an unknown kind", minimal([{ ...text(), kind: "agenda" }])],
    ["a path with S", minimal([{ kind: "shape", id: "s", name: "S", x: 0, y: 0, width: 1, height: 1, shape: "path", path: "M0 0 S1 1 2 2" }])],
    ["a relative path", minimal([{ kind: "shape", id: "s", name: "S", x: 0, y: 0, width: 1, height: 1, shape: "path", path: "M0 0 l1 1" }])],
    ["a two-number dash missing one", minimal([{ kind: "shape", id: "s", name: "S", x: 0, y: 0, width: 1, height: 1, stroke: { color: "#000000", width: 1, dash: [4] } }])],
    ["a coloured QR", minimal([{ kind: "qr", id: "q", name: "Q", x: 0, y: 0, width: 100, height: 100, dark: "#1F3BD8" }])],
    ["a QR quiet zone of 5", minimal([{ kind: "qr", id: "q", name: "Q", x: 0, y: 0, width: 100, height: 100, quietZone: 5 }])],
    ["an unknown image source", minimal([{ kind: "image", id: "i", name: "I", x: 0, y: 0, width: 1, height: 1, source: "gravatar" }])],
    ["SVG markup past 60000 characters", minimal([{ kind: "svg", id: "v", name: "V", x: 0, y: 0, width: 1, height: 1, markup: "x".repeat(60_001) }])],
    ["a recolour key that is not a colour", minimal([{ kind: "svg", id: "v", name: "V", x: 0, y: 0, width: 1, height: 1, markup: "<svg/>", recolor: { red: "#000000" } }])],
    ["a showIf that is not a token name", minimal([text({ showIf: "{{organization}}" })])],
    ["151 layers", minimal(Array.from({ length: 151 }, (_, i) => text({ id: `t${i}` })))],
  ])("%s", (_, raw) => {
    expect(bad(raw).success).toBe(false);
  });
});

describe("the v2 font list", () => {
  it("holds the 34 doc fonts and the v1 five", () => {
    expect(DOC_FONTS).toHaveLength(37);
    for (const family of Object.values(V1_FONT_FAMILY)) expect(findFont(family)).not.toBeNull();
    expect(findFont("bebas")?.family).toBe("Bebas Neue");
    expect(findFont("Cormorant Garamond")?.normal).toEqual([]);
  });

  it("names the nearest families for a typo", () => {
    expect(nearestFonts("Intr")).toEqual(["Inter", "Anton", "Lato"]);
    expect(nearestFonts("garamond").slice(0, 2)).toEqual(["Cormorant Garamond", "EB Garamond"]);
  });

  it("links the backend's stylesheet", () => {
    expect(fontsCssUrl("https://api.myotherapp.in/")).toBe("https://api.myotherapp.in/static/doc-fonts/fonts.css");
    expect(fontsCssUrl("https://api.myotherapp.in", "c4c0")).toBe("https://api.myotherapp.in/static/doc-fonts/fonts.css?v=c4c0");
  });
});
