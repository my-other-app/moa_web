import { type LayoutV2, parseLayoutV2 } from "@moa/layout";
import { describe, expect, it } from "vitest";

import { cssFill, resolveColorV2 } from "./fields";
import { accentLayers, copiesOf, newLayer, svgColors } from "./model";

/** New layers, copies, and what the accent paints. */

const layout = (layers: unknown[] = []): LayoutV2 =>
  parseLayoutV2({ version: 2, page: { widthMm: 101.6, heightMm: 152.4 }, canvas: { width: 384, height: 576, background: null }, vars: { accent: "#FF8A3D" }, layers });

describe("new layers", () => {
  it("are complete, valid layers sized for the canvas", () => {
    const base = layout();
    for (const spec of [{ kind: "text" }, { kind: "shape", shape: "rect" }, { kind: "image", source: "upload" }, { kind: "qr" }] as const) {
      const l = newLayer(spec, base);
      expect(l.kind).toBe(spec.kind);
      expect(l.x + l.width).toBeLessThanOrEqual(384);
      expect(l.y + l.height).toBeLessThanOrEqual(576);
      // Every default is filled: it round-trips through the schema unchanged.
      expect(parseLayoutV2({ ...base, layers: [l] }).layers[0]).toEqual(l);
    }
  });

  it("a QR is square, and the first one is called qr", () => {
    const qr = newLayer({ kind: "qr" }, layout());
    expect(qr.id).toBe("qr");
    expect(qr.width).toBe(qr.height);
  });

  it("a new shape follows the accent", () => {
    const s = newLayer({ kind: "shape", shape: "rect" }, layout());
    expect(accentLayers(layout([s])).map((l) => l.id)).toEqual([s.id]);
  });
});

describe("copies", () => {
  it("have fresh ids, a copy's name, sit a little off and are unlocked", () => {
    const src = newLayer({ kind: "text" }, layout());
    const base = layout([{ ...src, locked: true }]);
    const [copy] = copiesOf(base.layers, base);
    expect(copy!.id).not.toBe(src.id);
    expect(copy!.name).toBe("Text copy");
    expect(copy!.x).toBe(src.x + 12);
    expect(copy!.locked).toBe(false);
  });
});

describe("the colours in artwork", () => {
  it("lists each hex once, upper-cased, short ones spelled out", () => {
    expect(svgColors('<svg><path fill="#ff8a3d"/><circle stroke="#FFF" fill="#FF8A3D"/></svg>')).toEqual(["#FF8A3D", "#FFFFFF"]);
  });
});

describe("the colours the board paints", () => {
  const ctx = { accent: "#FF8A3D", primary: "#1b6b47", secondary: "#abc", ticketType: "#7A1FD8" };

  it("are the references resolved, as hex", () => {
    expect(["var:accent", "brand.primary", "brand.secondary", "ticket_type", "#00000040"].map((c) => resolveColorV2(c, ctx))).toEqual(["#FF8A3D", "#1b6b47", "#abc", "#7A1FD8", "#00000040"]);
    expect(resolveColorV2("ticket_type", { ...ctx, ticketType: undefined })).toBe("#1b6b47");
  });

  it("are #000000 for anything that is not a hex colour", () => {
    expect(resolveColorV2("red;x:y", ctx)).toBe("#000000");
    expect(resolveColorV2("var:accent", { ...ctx, accent: "orange" })).toBe("#000000");
    expect(resolveColorV2("brand.primary", { ...ctx, primary: "" })).toBe("#000000");
    expect(cssFill({ type: "linear", angle: 90, stops: [{ offset: 0, color: "x)" }, { offset: 1, color: "#FFFFFF" }] }, ctx)).toBe("linear-gradient(90deg, #000000 0%, #FFFFFF 100%)");
  });
});
