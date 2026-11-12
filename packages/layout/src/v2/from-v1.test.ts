import { describe, expect, it } from "vitest";

import { FONT_METRICS } from "../fonts";
import { AGENDA_STARTERS, agendaStarter, BADGE_STARTERS, badgeStarter } from "../starters";
import { buildBody } from "./build";
import { fromV1, scaleV1Path, V2_FACE_METRICS, v1Scale, v1Text } from "./from-v1";
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
      const body = buildBody(v2, samplesV2("badge"), { qr: "MOA-7K3QF-X9PLM" }, { kind: "badge" });
      expect(body.split("\n").length).toBeGreaterThan(10);
    }
  });

  it.each(Object.keys(AGENDA_STARTERS))("the %s programme stays a v1 layout", (key) => {
    expect(() => fromV1(agendaStarter(key as keyof typeof AGENDA_STARTERS))).toThrow("a programme (agenda) layout stays a v1 layout");
  });

  it("converts a programme's other layers once its agenda is gone", () => {
    const v1 = agendaStarter("programme");
    const v2 = fromV1({ ...v1, layers: v1.layers.filter((l) => l.kind !== "agenda") });
    expect(v2.canvas).toMatchObject({ width: 1240, height: 1754 });
    expect(errors(v2, "certificate")).toEqual([]);
    expect((v2.layers.find((l) => l.id === "title") as TextLayerV2).font.family).toBe("DM Serif Display");
  });
});

describe("fromV1, field by field", () => {
  const v1 = badgeStarter("card_cr80", { seats: false });
  const card = fromV1(v1);
  const byId = (id: string) => card.layers.find((l) => l.id === id)!;

  it("maps the v1 fonts to their CSS families, px spacing to em, and shrink to half the size", () => {
    const event = byId("event") as TextLayerV2;
    expect(event.font).toEqual({ family: "Roboto Mono", weight: 700, style: "normal" });
    expect(event.letterSpacing).toBe(0.0714);
    expect(event).toMatchObject({ lineHeight: 1.2, maxLines: 2, fit: "shrink", minSize: 14, color: "#FFFFFF" });
    expect((byId("type") as TextLayerV2).font.family).toBe("Bebas Neue");
    expect((byId("first") as TextLayerV2).font).toEqual({ family: "Inter", weight: 700, style: "normal" });
  });

  it("keeps each text's first baseline where reportlab drew it", () => {
    const src = v1.layers.find((l) => l.id === "event")!;
    const event = byId("event") as TextLayerV2;
    const m = FONT_METRICS["roboto-mono-700"]!;
    const [a2, d2] = V2_FACE_METRICS["Roboto Mono|700"]!;
    // reportlab: the baseline at the top plus the ascent. Chromium: half the leading, then the ascent.
    const baseline = src.y + (m.ascent / m.unitsPerEm) * 28;
    expect(event.y + ((1.2 - a2 - d2) / 2 + a2) * 28).toBeCloseTo(baseline, 2);
    expect(event.height).toBe(67.2);
  });

  it("keeps shapes, images and the QR as they were; a guest photo gets v1's initials", () => {
    expect(byId("head") as ShapeLayerV2).toMatchObject({ shape: "rect", fill: { type: "solid", color: "brand.primary" }, stroke: null, radius: [0, 0, 0, 0] });
    expect(byId("photo") as ImageLayerV2).toMatchObject({
      source: "guest_photo", fit: "cover", radius: [135, 135, 135, 135], placeholder: "initials",
      placeholderStyle: { color: "brand.primary", background: { type: "solid", color: "#E9ECF2" }, family: "Inter", weight: 700 },
    });
    expect(byId("logo") as ImageLayerV2).toMatchObject({ source: "org_logo", align: "left", placeholder: "none", placeholderStyle: null });
    expect(byId("qr") as QrLayerV2).toMatchObject({ width: 150, height: 150, quietZone: 2, dark: "#000000", light: "#FFFFFF" });
    expect(byId("code").opacity).toBe(0.85);
  });

  it("makes the ticket area the canvas, the template its bottom layer, and the page's height from its shape", () => {
    const v2 = fromV1({
      canvas: { width: 2400, height: 1000, background: "#f7f7f4", templateKey: "tpl/abc.png", templatePreprinted: true, area: { x: 100, y: 50, width: 2000, height: 800 } },
      page: { widthMm: 203.2, heightMm: null },
      layers: [
        { kind: "qr", id: "qr", name: "QR", x: 1700, y: 300, size: 300 },
        { kind: "shape", id: "tri", name: "Tri", x: 100, y: 50, width: 200, height: 100, path: "M0 0 L1000 0 L500 1000 Z", stroke: "#000000", strokeWidth: 3 },
      ],
    });
    expect(v2.page).toEqual({ widthMm: 203.2, heightMm: 81.28 });
    expect(v2.canvas).toMatchObject({ width: 2000, height: 800, background: { type: "solid", color: "#F7F7F4" } });
    expect(v2.layers[0]).toMatchObject({ id: "template", kind: "image", source: "upload", imageKey: "tpl/abc.png", x: -100, y: -50, width: 2400, height: 1000, preprinted: true, locked: false, fit: "cover" });
    expect(v2.layers[1]).toMatchObject({ id: "qr", x: 1600, y: 250 });
    expect(v2.layers[2]).toMatchObject({ shape: "path", path: "M0.0 0.0 L200.0 0.0 L100.0 100.0 Z", x: 0, y: 0, stroke: { color: "#000000", width: 3, dash: null } });
  });

  it("scales a canvas outside 300 to 3000 px into it", () => {
    expect(v1Scale(1000, 600)).toBe(1);
    expect(v1Scale(6000, 3000)).toBe(0.5);
    expect(v1Scale(200, 400)).toBe(1.5);
    const big = fromV1({ canvas: { width: 6000, height: 3000 }, page: { widthMm: 508, heightMm: 254 }, layers: [{ kind: "text", id: "t", name: "T", text: "x", x: 600, y: 300, width: 1200, size: 100, letterSpacing: 10 }] });
    expect(big.canvas).toMatchObject({ width: 3000, height: 1500 });
    expect(big.layers[0]).toMatchObject({ x: 300, width: 600, size: 50, minSize: 25, letterSpacing: 0.1 });
  });

  it("writes a v1 alias a design now means differently as the v1 key", () => {
    expect(v1Text("{{ role | upper }} on {{date}} · {{seat}} · {{name}}")).toBe("{{ ticket_type | upper }} on {{event_date}} · {{seat}} · {{name}}");
    expect(v1Text("{% if role %}x{% endif %}{% if not {{ticket_id}} %}y{% endif %}")).toBe("{% if ticket_type %}x{% endif %}{% if not {{ticket_code}} %}y{% endif %}");
  });

  it("scales a v1 outline as Python writes the numbers", () => {
    expect(scaleV1Path("M0 0 L1000 0 L500 1000 Z", 0.2, 0.1)).toBe("M0.0 0.0 L200.0 0.0 L100.0 100.0 Z");
    expect(scaleV1Path("M125 375", 0.1, 0.1)).toBe("M12.5 37.5");
    // Halves go to even, as Python's round does: 0.125 → 0.12, 0.375 → 0.38.
    expect(scaleV1Path("M1.25 3.75", 0.1, 0.1)).toBe("M0.12 0.38");
  });
});
