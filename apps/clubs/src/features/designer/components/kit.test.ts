import { describe, expect, it } from "vitest";
import type { TicketLayer } from "@moa/layout";

import { boxOf, type Layout, reduceHistory, scaleLayer } from "./kit";

const text: TicketLayer = {
  kind: "text", id: "t", name: "Name", text: "{{attendee_name}}", x: 10, y: 20, width: 300, size: 40, font: "inter", weight: 500, color: "#141614", align: "left",
  maxLines: 1, lineSpacing: 2, letterSpacing: 1, fit: "shrink", opacity: 1, hidden: false, locked: false, preprinted: false,
};
const qr: TicketLayer = { kind: "qr", id: "qr", name: "QR", x: 100, y: 100, size: 200, quietZone: 2, dark: "#000000", light: "#FFFFFF", hidden: false, locked: false, preprinted: false };
const layout = (layers: TicketLayer[]): Layout => ({
  canvas: { width: 1560, height: 690, background: "#FFFFFF", templateKey: null, templatePreprinted: false, area: null },
  layers,
  page: { widthMm: 203.2, heightMm: null },
});

describe("scaling a layer for a template of another size", () => {
  it("scales every length, to a tenth of a pixel", () => {
    expect(scaleLayer(text, 1.5)).toMatchObject({ x: 15, y: 30, width: 450, size: 60, lineSpacing: 3, letterSpacing: 1.5 });
    expect(scaleLayer(qr, 0.5)).toMatchObject({ x: 50, y: 50, size: 100 });
  });
});

describe("a layer's box", () => {
  it("is the laid-out height for text, the square for a QR", () => {
    expect(boxOf(text, 96)).toEqual({ x: 10, y: 20, w: 300, h: 96 });
    expect(boxOf(text)).toEqual({ x: 10, y: 20, w: 300, h: 48 });
    expect(boxOf(qr)).toEqual({ x: 100, y: 100, w: 200, h: 200 });
  });
});

describe("undo history", () => {
  const start = { past: [], present: layout([qr]), future: [], group: null, at: 0 };

  it("applies an updater against the present, and makes a step", () => {
    const h = reduceHistory(start, { type: "set", next: (l) => ({ ...l, layers: [...l.layers, text] }) });
    expect(h.present.layers).toHaveLength(2);
    expect(h.past).toHaveLength(1);
    const back = reduceHistory(h, { type: "undo" });
    expect(back.present.layers).toHaveLength(1);
    expect(reduceHistory(back, { type: "redo" }).present.layers).toHaveLength(2);
  });

  it("folds a run of changes in one group into a single step until it is sealed", () => {
    const a = reduceHistory(start, { type: "set", next: (l) => ({ ...l, layers: [{ ...qr, x: 101 }] }), group: "drag-qr" });
    const b = reduceHistory(a, { type: "set", next: (l) => ({ ...l, layers: [{ ...qr, x: 102 }] }), group: "drag-qr" });
    expect(b.past).toHaveLength(1);
    const sealed = reduceHistory(b, { type: "seal" });
    const c = reduceHistory(sealed, { type: "set", next: (l) => ({ ...l, layers: [{ ...qr, x: 103 }] }), group: "drag-qr" });
    expect(c.past).toHaveLength(2);
  });

  it("ignores a change that changes nothing", () => {
    expect(reduceHistory(start, { type: "set", next: (l) => l })).toBe(start);
  });
});
