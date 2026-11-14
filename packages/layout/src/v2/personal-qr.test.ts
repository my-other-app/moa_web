import { describe, expect, it } from "vitest";

import { buildBody, buildLayer, layerDrawn, qrPayloadOf, qrSvg } from "./build";
import { dumpLayoutV2, isCodeQr, isPersonalQr, LayerV2, LayoutV2, parseLayoutV2, PERSONAL_QR, type QrLayerV2 } from "./schema";
import { minimal, textRaw } from "./test-utils";
import { validate } from "./validate";

/**
 * The Personal QR (profiles and networking contract, "Badges"): a QR layer
 * bound to `holder.profile_qr_url`, the holder's active /p/ address in the
 * registration's render data, beside the check-in code and separate from it.
 * Left out for a holder without one; never counted as the code the gate scans.
 */
const URL = "https://myotherapp.in/p/k7m2x9q4ta";
const code = (more: Record<string, unknown> = {}) => ({ kind: "qr", id: "qr", name: "QR code", x: 250, y: 440, width: 108, height: 108, quietZone: 2, ...more });
const personal = (more: Record<string, unknown> = {}) => code({ id: "personal-qr", name: "Personal QR", x: 26, bind: PERSONAL_QR, ...more });
const codes = (raw: unknown, kind = "badge") => validate(raw, kind).map((p) => p.code);
const qrOf = (raw: unknown) => LayerV2.parse(raw) as QrLayerV2;

describe("the layer", () => {
  it("is a QR bound to the holder's profile address; a plain QR is bound to nothing", () => {
    const l = qrOf(personal());
    expect(l.bind).toBe("holder.profile_qr_url");
    expect(isPersonalQr(l)).toBe(true);
    expect(isCodeQr(l)).toBe(false);
    const c = qrOf(code());
    expect(c.bind).toBeUndefined();
    expect(isCodeQr(c)).toBe(true);
    expect(isPersonalQr(c)).toBe(false);
    expect(isCodeQr(LayerV2.parse(textRaw()))).toBe(false);
  });

  it("goes out without the field when unbound, so a design without it is what it always was", () => {
    // The board sends the parsed layout itself: an unbound QR must not carry the field at all.
    const parsed = parseLayoutV2(minimal([code(), textRaw()]));
    expect(parsed.layers[0]).not.toHaveProperty("bind");
    expect(JSON.stringify(parsed)).not.toContain("bind");
    const dumped = dumpLayoutV2(parseLayoutV2(minimal([code()])));
    expect((dumped.layers as Record<string, unknown>[])[0]).not.toHaveProperty("bind");
    const both = dumpLayoutV2(parseLayoutV2(minimal([code(), personal()])));
    expect((both.layers as Record<string, unknown>[])[1]).toMatchObject({ kind: "qr", bind: "holder.profile_qr_url" });
  });

  it("binds to nothing else", () => {
    expect(LayoutV2.safeParse(minimal([code({ bind: "attendee_name" })])).success).toBe(false);
    expect(codes(minimal([code({ bind: "attendee_name" })]))).toEqual(["schema"]);
  });
});

describe("drawn", () => {
  const layout = parseLayoutV2(minimal([code(), personal()]));
  const [codeLayer, personalLayer] = layout.layers as [LayoutV2["layers"][number], LayoutV2["layers"][number]];

  it("encodes the holder's address, and the code QR still the ticket code", () => {
    const values = { [PERSONAL_QR]: URL };
    expect(qrPayloadOf({ bind: PERSONAL_QR }, values, "TK-48213")).toBe(URL);
    expect(qrPayloadOf({ bind: null }, values, "TK-48213")).toBe("TK-48213");
    const drawn = buildLayer(layout, personalLayer, values, { qr: "TK-48213" }, { kind: "badge" })!;
    expect(drawn).toContain('data-layer="personal-qr"');
    expect(drawn).toContain(qrSvg(URL, 2));
    expect(drawn).not.toContain(qrSvg("TK-48213", 2));
    expect(buildLayer(layout, codeLayer, values, { qr: "TK-48213" }, { kind: "badge" })).toContain(qrSvg("TK-48213", 2));
  });

  it("is left out for a holder without one: no value, an empty one, or only spaces", () => {
    for (const values of [{}, { [PERSONAL_QR]: "" }, { [PERSONAL_QR]: "  " }, { [PERSONAL_QR]: null }]) {
      expect(buildLayer(layout, personalLayer, values, { qr: "TK-48213" }, { kind: "badge" })).toBeNull();
      expect(layerDrawn(personalLayer, values, { qr: "TK-48213" }, { kind: "badge" })).toBe(false);
      const body = buildBody(layout, values, { qr: "TK-48213" }, { kind: "badge" });
      expect(body).toContain('data-layer="qr"');
      expect(body).not.toContain('data-layer="personal-qr"');
    }
    expect(layerDrawn(personalLayer, { [PERSONAL_QR]: URL }, {}, { kind: "badge" })).toBe(true);
    // The code QR is drawn whatever the holder has.
    expect(layerDrawn(codeLayer, {}, {}, { kind: "badge" })).toBe(true);
  });
});

describe("checked", () => {
  it("passes a badge with its code and a Personal QR beside it", () => {
    expect(validate(minimal([code(), personal()]), "badge")).toEqual([]);
  });

  it("is not the code the gate scans: alone, the badge still needs its QR", () => {
    expect(codes(minimal([personal()]))).toEqual(["qr_missing"]);
    expect(codes(minimal([personal()]), "ticket")).toEqual(["qr_missing"]);
  });

  it("is one at most, said apart from the code QR", () => {
    expect(validate(minimal([code(), personal(), personal({ id: "personal-2", x: 140 })]), "badge")).toEqual([
      { code: "qr_extra", field: "layers.2", message: "A design has one Personal QR.", level: "error", layer: "personal-2" },
    ]);
  });

  it("may be hidden or shown on a condition, unlike the code QR", () => {
    expect(codes(minimal([code(), personal({ hidden: true })]))).toEqual([]);
    expect(codes(minimal([code(), personal({ showIf: "full_name" })]))).toEqual([]);
    expect(codes(minimal([code({ hidden: true }), personal()]))).toEqual(["qr_hidden"]);
  });

  it("is held to the same size and page as any QR, so it scans", () => {
    expect(codes(minimal([code(), personal({ width: 30, height: 30 })]))).toEqual(["qr_small"]);
    expect(codes(minimal([code(), personal({ x: 360 })]))).toEqual(["qr_outside"]);
  });
});
