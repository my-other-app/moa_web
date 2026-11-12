import { describe, expect, it } from "vitest";

import { FONT_METRICS } from "../fonts";
import { AGENDA_STARTERS, agendaStarter, BADGE_STARTERS, badgeStarter } from "../starters";
import { buildBody } from "./build";
import { fromV1, v1Scale } from "./from-v1";
import { type ImageLayerV2, type QrLayerV2, type ShapeLayerV2, type TextLayerV2 } from "./schema";
import { samplesV2 } from "./tokens";
import { validate } from "./validate";

const errors = (layout: unknown, kind: string) => validate(layout, kind).filter((p) => p.level === "error");

describe("fromV1 on the v1 starters", () => {
  it.each(Object.keys(BADGE_STARTERS))("the %s card becomes a valid v2 badge, layer for layer", (key) => {
    for (const seats of [false, true]) {
      const v1 = badgeStarter(key as keyof typeof BADGE_STARTERS, { seats });
      const v2 = fromV1(v1);
      expect(v2.version).toBe(2);
      expect(v2.page).toEqual({ widthMm: 54, heightMm: 85.6 });
      expect(v2.canvas).toEqual({ width: v1.canvas.width, height: v1.canvas.height, background: { type: "solid", color: "#FFFFFF" } });
      expect(v2.layers.map((l) => l.id)).toEqual(v1.layers.map((l) => l.id));
      expect(errors(v2, "badge")).toEqual([]);
      // It draws, with every token filled.
      const body = buildBody(v2, samplesV2("badge"), { qr: "MOA-7K3QF-X9PLM" }, { kind: "badge" });
      expect(body).not.toContain("{{");
    }
  });

  it.each(Object.keys(AGENDA_STARTERS))("the %s programme converts, its agenda left out", (key) => {
    const v1 = agendaStarter(key as keyof typeof AGENDA_STARTERS);
    const v2 = fromV1(v1);
    expect(v2.layers.some((l) => l.id === "agenda")).toBe(false);
    expect(v2.layers).toHaveLength(v1.layers.length - 1);
    expect(errors(v2, "certificate").filter((p) => p.code !== "page_shape")).toEqual([]);
    expect(v2.canvas.width).toBeLessThanOrEqual(3000);
  });
});

describe("fromV1, field by field", () => {
  const card = fromV1(badgeStarter("card_cr80", { seats: false }));
  const v1 = badgeStarter("card_cr80", { seats: false });
  const byId = (id: string) => card.layers.find((l) => l.id === id)!;

  it("maps the v1 fonts to their CSS families, and px spacing to em", () => {
    const event = byId("event") as TextLayerV2;
    expect(event.font).toEqual({ family: "Roboto Mono", weight: 700, style: "normal" });
    expect(event.letterSpacing).toBeCloseTo(2 / 28, 4);
    expect(event.maxLines).toBe(2);
    expect(event.fit).toBe("shrink");
    expect(event.minSize).toBeNull();
    expect((byId("type") as TextLayerV2).font.family).toBe("Bebas Neue");
    expect((byId("first") as TextLayerV2).font).toEqual({ family: "Inter", weight: 700, style: "normal" });
  });

  it("moves text up by its half-leading so the first baseline stays where v1 put it", () => {
    const src = v1.layers.find((l) => l.id === "event")!;
    const event = byId("event") as TextLayerV2;
    const m = FONT_METRICS["roboto-mono-700"]!;
    const halfLeading = (28 * 1.2 - ((m.ascent - m.descent) / m.unitsPerEm) * 28) / 2;
    expect(event.y).toBeCloseTo(src.y - halfLeading, 3);
    expect(event.height).toBeCloseTo(28 * 1.2 * 2, 3);
  });

  it("keeps shapes, images and the QR as they were", () => {
    expect(byId("head") as ShapeLayerV2).toMatchObject({ shape: "rect", fill: { type: "solid", color: "brand.primary" }, stroke: null, radius: [0, 0, 0, 0] });
    expect(byId("photo") as ImageLayerV2).toMatchObject({ source: "guest_photo", fit: "cover", radius: [135, 135, 135, 135], placeholder: "initials" });
    expect(byId("logo") as ImageLayerV2).toMatchObject({ source: "org_logo", align: "left", placeholder: "none" });
    expect(byId("qr") as QrLayerV2).toMatchObject({ width: 150, height: 150, quietZone: 2, dark: "#000000", light: "#FFFFFF" });
    expect(byId("code").opacity).toBe(0.85);
  });

  it("makes the ticket area the canvas, the template its bottom layer, and the page's height from its shape", () => {
    const v2 = fromV1({
      canvas: { width: 2400, height: 1000, background: "#f7f7f4", templateKey: "tpl/abc.png", templatePreprinted: true, area: { x: 100, y: 50, width: 2000, height: 800 } },
      page: { widthMm: 203.2, heightMm: null },
      layers: [{ kind: "qr", id: "qr", name: "QR", x: 1700, y: 300, size: 300 }, { kind: "shape", id: "tri", name: "Tri", x: 100, y: 50, width: 200, height: 100, path: "M0 0 L1000 0 L500 1000 Z" }],
    });
    expect(v2.page).toEqual({ widthMm: 203.2, heightMm: 81.28 });
    expect(v2.canvas).toMatchObject({ width: 2000, height: 800, background: { type: "solid", color: "#F7F7F4" } });
    expect(v2.layers[0]).toMatchObject({ id: "template", kind: "image", source: "upload", imageKey: "tpl/abc.png", x: -100, y: -50, width: 2400, height: 1000, preprinted: true, locked: true, fit: "cover" });
    expect(v2.layers[1]).toMatchObject({ id: "qr", x: 1600, y: 250 });
    expect(v2.layers[2]).toMatchObject({ shape: "path", path: "M0 0 L200 0 L100 100 Z", x: 0, y: 0 });
  });

  it("scales a canvas outside 300 to 3000 px into it", () => {
    expect(v1Scale(1000, 600)).toBe(1);
    expect(v1Scale(6000, 3000)).toBe(0.5);
    expect(v1Scale(200, 400)).toBe(1.5);
    const big = fromV1({ canvas: { width: 6000, height: 3000 }, page: { widthMm: 508, heightMm: 254 }, layers: [{ kind: "text", id: "t", name: "T", text: "x", x: 600, y: 300, width: 1200, size: 100, letterSpacing: 10 }] });
    expect(big.canvas).toMatchObject({ width: 3000, height: 1500 });
    expect(big.layers[0]).toMatchObject({ x: 300, width: 600, size: 50, letterSpacing: 0.1 });
  });
});
