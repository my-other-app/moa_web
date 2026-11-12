import { describe, expect, it } from "vitest";

import { buildBody, buildHtml, buildLayer, fontUses, initialsOf, layerDrawn, pageCss, qrSvg, svgMarkup } from "./build";
import { esc, gFmt, num, Paint, radiusCss } from "./css";
import { parseLayoutV2 } from "./schema";
import { minimal, textRaw } from "./test-utils";

const ctx = { qr: "MOA-7K3QF-X9PLM", colors: { primary: "#1b6b47", secondary: "#f2c14e", ticketType: "#7a1fd8" } };
const values = { attendee_name: "Ananya Iyer", organization: "", event_name: "Builders Day", first_name: "Ananya", last_name: "Iyer" };
const PNG = "data:image/png;base64,iVBORw0KGgo=";

const one = (layer: Record<string, unknown>, more: Record<string, unknown> = {}, vals: Record<string, string> = values, c: Record<string, unknown> = ctx, opts = {}) => {
  const layout = parseLayoutV2(minimal([layer], more));
  return buildLayer(layout, layout.layers[0]!, vals, c, opts);
};

describe("numbers, escaping and colours", () => {
  it("writes numbers half up to 3 decimals, no trailing zeros, never -0", () => {
    expect([num(12), num(12.5), num(0.1 + 0.2), num(1 / 3), num(2.0005), num(-0.0001), num(-1.5), num(0.0625)]).toEqual(["12", "12.5", "0.3", "0.333", "2.001", "0", "-1.5", "0.063"]);
    expect([gFmt(101.6), gFmt(54), gFmt(152.4), gFmt(85.6)]).toEqual(["101.6", "54", "152.4", "85.6"]);
  });

  it("escapes & < > \" ' as Python's html.escape", () => {
    expect(esc(`<b>"Tom" & 'Jerry'</b>`)).toBe("&lt;b&gt;&quot;Tom&quot; &amp; &#x27;Jerry&#x27;&lt;/b&gt;");
  });

  it("resolves var:accent, the brand and the ticket type; hex upper case", () => {
    const paint = new Paint({ vars: { accent: "#FF8A3D" } }, { primary: "#1b6b47", secondary: "#f2c14e", ticketType: "#7a1fd8" });
    expect(["var:accent", "brand.primary", "brand.secondary", "ticket_type", "#abcdef", "#abcdef80"].map((c) => paint.color(c))).toEqual([
      "#FF8A3D", "#1B6B47", "#F2C14E", "#7A1FD8", "#ABCDEF", "#ABCDEF80",
    ]);
    expect(new Paint({ vars: { accent: null } }).color("var:accent")).toBe("#000000");
  });

  it("writes fills as CSS gradients", () => {
    const paint = new Paint({ vars: { accent: "#FF8A3D" } });
    const stops = [{ offset: 0, color: "var:accent" }, { offset: 0.355, color: "#000000" }, { offset: 1, color: "#ffffff" }];
    expect(paint.fill({ type: "solid", color: "#ffffff" })).toBe("#FFFFFF");
    expect(paint.fill({ type: "linear", angle: 135, stops })).toBe("linear-gradient(135deg, #FF8A3D 0%, #000000 35.5%, #FFFFFF 100%)");
    expect(paint.fill({ type: "radial", cx: 0.35, cy: 0.2, stops })).toBe("radial-gradient(circle at 35% 20%, #FF8A3D 0%, #000000 35.5%, #FFFFFF 100%)");
  });

  it("writes one radius when the corners agree, none when all are 0", () => {
    expect([radiusCss([0, 0, 0, 0]), radiusCss([4, 4, 4, 4]), radiusCss([4, 4, 0, 0])]).toEqual([null, "4px", "4px 4px 0px 0px"]);
  });
});

describe("the body", () => {
  it("is the root, then one drawn layer per line", () => {
    const layout = parseLayoutV2(minimal([textRaw(), { kind: "shape", id: "s", name: "S", x: 0, y: 0, width: 10, height: 10, fill: { type: "solid", color: "#000000" } }], { canvas: { width: 384, height: 576, background: { type: "solid", color: "var:accent" } }, vars: { accent: "#ff8a3d" } }));
    const body = buildBody(layout, values, ctx);
    const lines = body.split("\n");
    expect(lines[0]).toBe('<div class="moa-doc" style="position:relative;width:384px;height:576px;overflow:hidden;background:#FF8A3D">');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toMatch(/^<div data-layer="t1" data-kind="text"/);
    expect(lines[2]).toMatch(/^<div data-layer="s" data-kind="shape"/);
    expect(lines[3]).toBe("</div>");
  });

  it("an empty design is its root and a closing line", () => {
    expect(buildBody(parseLayoutV2(minimal()), {}, ctx)).toBe('<div class="moa-doc" style="position:relative;width:384px;height:576px;overflow:hidden">\n</div>');
  });

  it("writes rotation and opacity only when they are not the default", () => {
    expect(one(textRaw())).toMatch(/style="position:absolute;left:10px;top:20px;width:200px;height:40px">/);
    expect(one(textRaw({ rotation: -12.5, opacity: 0.85 }))).toMatch(/height:40px;transform:rotate\(-12\.5deg\);transform-origin:center;opacity:0\.85">/);
  });

  it("leaves out hidden layers, unmet showIfs, empty text and (on stock) preprinted layers", () => {
    expect(one(textRaw({ hidden: true }))).toBeNull();
    expect(one(textRaw({ showIf: "organization" }))).toBeNull();
    expect(one(textRaw({ showIf: "organization|attendee_name" }))).not.toBeNull();
    expect(one(textRaw({ showIf: "organization attendee_name" }))).toBeNull();
    expect(one(textRaw({ showIf: "name" }))).not.toBeNull();
    expect(one(textRaw({ text: "{{organization}}" }))).toBeNull();
    expect(one(textRaw({ text: "  " }))).toBeNull();
    const stock = { kind: "shape", id: "s", name: "S", x: 0, y: 0, width: 10, height: 10, preprinted: true, fill: { type: "solid", color: "#000000" } };
    expect(one(stock, {}, values, ctx, { skipPreprinted: true })).toBeNull();
    expect(one(stock)).not.toBeNull();
    // Text naming the guest is never on the stock.
    expect(one(textRaw({ preprinted: true }), {}, values, ctx, { skipPreprinted: true })).not.toBeNull();
    const layout = parseLayoutV2(minimal([textRaw({ hidden: true })]));
    expect(layerDrawn(layout.layers[0]!, values)).toBe(false);
  });

  it("shows a layer whose showIf names a picture only when the context has it", () => {
    const logo = { kind: "shape", id: "frame", name: "Frame", x: 0, y: 0, width: 10, height: 10, showIf: "logo_src", fill: { type: "solid", color: "#000000" } };
    expect(one(logo)).toBeNull();
    expect(one(logo, {}, values, { ...ctx, images: { org_logo: PNG } })).not.toBeNull();
    expect(one({ ...logo, showIf: "photo_url|signature_src" }, {}, values, { ...ctx, images: { signature_1: PNG } })).not.toBeNull();
  });
});

describe("text", () => {
  it("is a flex box holding the fitted text, the template filled and escaped", () => {
    const html = one(textRaw({ text: "{{attendee_name | upper}} <&> 'x'" }));
    expect(html).toBe(
      '<div data-layer="t1" data-kind="text" style="position:absolute;left:10px;top:20px;width:200px;height:40px">' +
        '<div class="moa-t" style="display:flex;flex-direction:column;justify-content:flex-start;box-sizing:border-box;width:100%;height:100%;padding:0px 0px 0px 0px">' +
        `<div data-fit="shrink" data-min="16" data-lines="1" style="font-family:'Inter';font-weight:400;font-style:normal;font-size:32px;line-height:1.2;letter-spacing:0em;color:#141614;text-align:left;text-transform:none;white-space:pre-wrap;overflow-wrap:anywhere">` +
        "ANANYA IYER &lt;&amp;&gt; &#x27;x&#x27;</div></div></div>",
    );
  });

  it("carries valign, padding, background, radius, wrap and text shadows", () => {
    const html = one(
      textRaw({
        valign: "bottom", padding: [4, 8, 4, 8], background: { type: "solid", color: "#000000" }, radius: [4, 4, 0, 0], textWrap: "balance",
        shadow: [{ x: 0, y: 1, blur: 2, spread: 9, color: "#00000080", inset: true }, { x: 1, y: 1 }], letterSpacing: 0.08, lineHeight: 1.05,
        align: "center", transform: "upper", font: { family: "Space Mono", weight: 700, style: "normal" }, color: "var:accent", fit: "ellipsis", maxLines: 2,
      }),
      { vars: { accent: "#FF8A3D" } },
    )!;
    expect(html).toContain("justify-content:flex-end;box-sizing:border-box;width:100%;height:100%;padding:4px 8px 4px 8px;background:#000000;border-radius:4px 4px 0px 0px\">");
    expect(html).toContain('data-fit="ellipsis" data-min="32" data-lines="2"');
    expect(html).toContain("font-family:'Space Mono';font-weight:700;font-style:normal;font-size:32px;line-height:1.05;letter-spacing:0.08em;color:#FF8A3D;text-align:center;text-transform:uppercase;white-space:pre-wrap;overflow-wrap:anywhere;text-wrap:balance;text-shadow:0px 1px 2px #00000080, 1px 1px 0px #00000040\"");
  });

  it("shrinks to minSize, else half the size", () => {
    expect(one(textRaw({ minSize: 12 }))).toContain('data-min="12"');
    expect(one(textRaw({ size: 31 }))).toContain('data-min="15.5"');
    expect(one(textRaw({ fit: "none" }))).toContain('data-fit="none" data-min="32"');
  });

  it("draws spans with only what each sets, sizes in em of the layer's", () => {
    const html = one(textRaw({ spans: [{ text: "for " }, { text: "{{event_name}}", weight: 700, size: 40, color: "brand.primary", letterSpacing: 0.1, transform: "upper", family: "Inter", style: "italic" }] }))!;
    expect(html).toContain(`<span>for </span><span style="font-family:'Inter';font-weight:700;font-style:italic;font-size:1.25em;color:#1B6B47;letter-spacing:0.1em;text-transform:uppercase">Builders Day</span></div>`);
    expect(one(textRaw({ spans: [{ text: "{{organization}}" }] }))).toBeNull();
  });

  it("reads a design token as the kind's own", () => {
    const html = one(textRaw({ text: "{{role}}" }), {}, { role: "SPEAKER", ticket_type: "VIP" }, ctx, { kind: "badge" });
    expect(html).toContain(">SPEAKER</div>");
    expect(one(textRaw({ text: "{{role}}" }), {}, { role: "SPEAKER", ticket_type: "VIP" }, ctx, { kind: "ticket" })).toContain(">VIP</div>");
  });
});

describe("shapes", () => {
  const shape = (more: Record<string, unknown>) => ({ kind: "shape", id: "s", name: "S", x: 1, y: 2, width: 100, height: 50, ...more });

  it("draws a rect or an ellipse as CSS on the layer itself", () => {
    expect(one(shape({ fill: { type: "solid", color: "#1b6b47" }, stroke: { color: "#000000", width: 2 }, radius: 8, shadow: { y: 2, blur: 4 } }))).toBe(
      '<div data-layer="s" data-kind="shape" style="position:absolute;left:1px;top:2px;width:100px;height:50px;box-sizing:border-box;background:#1B6B47;border:2px solid #000000;border-radius:8px;box-shadow:0px 2px 4px 0px #00000040"></div>',
    );
    expect(one(shape({ shape: "ellipse", radius: 8 }))).toBe('<div data-layer="s" data-kind="shape" style="position:absolute;left:1px;top:2px;width:100px;height:50px;box-sizing:border-box;border-radius:50%"></div>');
  });

  it("draws a path in an svg of the layer box, gradients in its defs, shadows as drop-shadows", () => {
    const html = one(shape({ shape: "path", path: "M0 0 L100 0 L50 50 Z", fill: { type: "linear", angle: 90, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] }, shadow: [{ y: 2, blur: 4 }, { x: 1, inset: true }] }))!;
    expect(html).toBe(
      '<div data-layer="s" data-kind="shape" style="position:absolute;left:1px;top:2px;width:100px;height:50px;filter:drop-shadow(0px 2px 4px #00000040)">' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" width="100%" height="100%" preserveAspectRatio="none" style="display:block;overflow:visible">' +
        '<defs><linearGradient id="s-fill" gradientUnits="userSpaceOnUse" x1="0" y1="25" x2="100" y2="25"><stop offset="0" stop-color="#000000"></stop><stop offset="1" stop-color="#FFFFFF"></stop></linearGradient></defs>' +
        '<path d="M0 0 L100 0 L50 50 Z" fill="url(#s-fill)"></path></svg></div>',
    );
  });

  it("draws a dashed rect as an inset rounded path, a dashed ellipse inside its box", () => {
    const rect = one(shape({ stroke: { color: "#000000", width: 2, dash: [6, 3] }, radius: 9 }))!;
    expect(rect).toContain('<path d="M9 1H91A8 8 0 0 1 99 9V41A8 8 0 0 1 91 49H9A8 8 0 0 1 1 41V9A8 8 0 0 1 9 1Z" fill="none" stroke="#000000" stroke-width="2" stroke-dasharray="6 3"></path>');
    const ellipse = one(shape({ shape: "ellipse", stroke: { color: "#000000", width: 4, dash: [1, 1] }, fill: { type: "radial", cx: 0.5, cy: 0.5, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] } }))!;
    expect(ellipse).toContain('<radialGradient id="s-fill" gradientUnits="userSpaceOnUse" cx="50" cy="25" r="55.902">');
    expect(ellipse).toContain('<ellipse cx="50" cy="25" rx="48" ry="23" fill="url(#s-fill)" stroke="#000000" stroke-width="4" stroke-dasharray="1 1"></ellipse>');
  });
});

describe("svg art", () => {
  it("is sanitised, recoloured, its ids made the layer's own, scaled per its fit", () => {
    const layout = parseLayoutV2(minimal([{
      kind: "svg", id: "art", name: "Art", x: 0, y: 0, width: 10, height: 10, fit: "cover", recolor: { "#ff8a3d": "var:accent", "#000000": "brand.primary" },
      markup: '<svg width="20" height="10" onload="x()"><defs><linearGradient id="g"><stop stop-color="#FF8A3D"/></linearGradient></defs><rect fill="url(#g)" stroke="#000000" width="1" height="1"/><use href="#g"/><script>alert(1)</script></svg>',
    }], { vars: { accent: "#123456" } }));
    const paint = new Paint(layout, ctx.colors);
    expect(svgMarkup(layout.layers[0] as never, paint)).toBe(
      '<svg preserveAspectRatio="xMidYMid slice" width="100%" height="100%" style="display:block" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10">' +
        '<defs><linearGradient id="art-g"><stop stop-color="#123456"></stop></linearGradient></defs><rect fill="url(#art-g)" stroke="#1B6B47" width="1" height="1"></rect><use href="#art-g"></use></svg>',
    );
  });
});

describe("images", () => {
  const image = (more: Record<string, unknown>) => ({ kind: "image", id: "i", name: "I", x: 0, y: 0, width: 80, height: 80, ...more });

  it("draws a data: picture with object-fit and position", () => {
    expect(one(image({ source: "org_logo", fit: "cover", align: "left", valign: "bottom", radius: 40, border: { color: "#ffffff", width: 3 } }), {}, values, { ...ctx, images: { org_logo: PNG } })).toBe(
      `<div data-layer="i" data-kind="image" style="position:absolute;left:0px;top:0px;width:80px;height:80px"><img src="${PNG}" alt="" style="display:block;width:100%;height:100%;box-sizing:border-box;object-fit:cover;object-position:0% 100%;border-radius:40px;border:3px solid #FFFFFF"></div>`,
    );
  });

  it("finds an upload by its key, and never draws a URL unless asked", () => {
    expect(one(image({ imageKey: "k1" }), {}, values, { ...ctx, images: { "upload:k1": PNG } })).toContain(`src="${PNG}"`);
    expect(one(image({ source: "org_logo" }), {}, values, { ...ctx, images: { org_logo: "https://cdn.example/logo.png" } })).toBeNull();
    expect(one(image({ source: "org_logo" }), {}, values, { ...ctx, images: { org_logo: "https://cdn.example/logo.png" } }, { allowImageUrls: true })).toContain('src="https://cdn.example/logo.png"');
  });

  it("puts a shadow on the layer, with its radius", () => {
    expect(one(image({ source: "org_logo", radius: 8, shadow: { blur: 6 } }), {}, values, { ...ctx, images: { org_logo: PNG } })).toMatch(/height:80px;box-shadow:0px 0px 6px 0px #00000040;border-radius:8px">/);
  });

  it("falls back to an initials tile for a guest photo, or nothing", () => {
    expect(one(image({ source: "guest_photo", placeholder: "initials", radius: 40 }))).toBe(
      '<div data-layer="i" data-kind="image" style="position:absolute;left:0px;top:0px;width:80px;height:80px">' +
        `<div class="moa-initials" style="width:100%;height:100%;box-sizing:border-box;display:flex;align-items:center;justify-content:center;container-type:size;color:#3C4257;background:#E9ECF2;font-family:'Inter';font-weight:700;border-radius:40px">` +
        '<span style="font-size:42cqmin;line-height:1;letter-spacing:-0.02em">AI</span></div></div>',
    );
    expect(one(image({ source: "guest_photo", placeholder: "initials", placeholderStyle: { color: "#ffffff", background: { type: "solid", color: "var:accent" }, family: "Sora", weight: 800 } }), { vars: { accent: "#FF8A3D" } })).toContain(
      "color:#FFFFFF;background:#FF8A3D;font-family:'Sora';font-weight:800\"",
    );
    expect(one(image({ source: "guest_photo" }))).toBeNull();
  });

  it("takes initials from initials, the first and last name, or a full name", () => {
    expect(initialsOf({ initials: "abcd" })).toBe("ABC");
    expect(initialsOf({ first_name: "meera", last_name: "pillai" })).toBe("MP");
    expect(initialsOf({ recipient_name: "Ananya R. Menon" })).toBe("AM");
    expect(initialsOf({ full_name: "Cher" })).toBe("C");
    expect(initialsOf({})).toBe("?");
  });
});

describe("the QR", () => {
  it("is black on white, the quiet zone as a border, in its box", () => {
    const html = one({ kind: "qr", id: "q", name: "QR", x: 10, y: 10, width: 100, height: 100, quietZone: 2, background: { type: "solid", color: "#ffffff" }, radius: 6, shadow: { blur: 4 } })!;
    expect(html).toMatch(
      /^<div data-layer="q" data-kind="qr" style="position:absolute;left:10px;top:10px;width:100px;height:100px;box-shadow:0px 0px 4px 0px #00000040"><div class="moa-qr" style="width:100%;height:100%;box-sizing:border-box;background:#FFFFFF;border-radius:6px"><svg width="100%" height="100%" style="display:block" xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 25 25" shape-rendering="crispEdges"><rect width="25" height="25" fill="#fff"\/><path fill="#000" d="M2 2h7v1h-7z/,
    );
    expect(html.endsWith('"/></svg></div></div>')).toBe(true);
  });

  it("draws a sample when there is no payload", () => {
    expect(qrSvg("", 0)).toContain('viewBox="0 0 21 21"');
  });
});

describe("the page", () => {
  it("is the doc_designs shell: page size, fonts, base styles, the fit script, the page markers", () => {
    const layout = parseLayoutV2(minimal([textRaw()]));
    const html = buildHtml(layout, values, { ...ctx, title: "Ticket <1>" }, { forBrowser: true, fontsCssUrl: "https://api.example/static/doc-fonts/fonts.css" });
    expect(html).toContain('<meta name="moa-design" content="layout-v2">\n<meta name="moa-page" content="101.6mm 152.4mm">\n<title>Ticket &lt;1&gt;</title>\n<!--moa:head-->\n<link rel="stylesheet" data-moa="fonts" href="https://api.example/static/doc-fonts/fonts.css">');
    expect(html).toContain('<!--moa:page--><div class="moa-page" data-canvas="384x576">\n<div class="moa-doc"');
    expect(html).toContain('<script data-moa="fit">');
    expect(html).toContain("window.__moaReady = true");
    // 384 px is 101.6 mm at 96 per inch: no scale when printed.
    expect(pageCss(layout)).toBe('html,body{margin:0;padding:0}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}.moa-page[data-canvas="384x576"]{width:384px;height:576px}@media print{.moa-page[data-canvas="384x576"]{width:101.6mm;height:152.4mm}}');
    expect(buildHtml(layout, values, ctx, { fontCss: "@font-face{}" })).toContain('<style data-moa="fonts">\n@font-face{}\n</style>');
  });

  it("scales a canvas that is not 96 px per inch to the paper", () => {
    const card = parseLayoutV2({ ...minimal(), page: { widthMm: 54, heightMm: 85.6 }, canvas: { width: 638, height: 1011 } });
    expect(pageCss(card)).toBe(
      'html,body{margin:0;padding:0}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}.moa-page[data-canvas="638x1011"]{width:638px;height:1011px}@media print{.moa-page[data-canvas="638x1011"]{width:54mm;height:85.6mm}.moa-page[data-canvas="638x1011"] .moa-doc{transform:scale(0.319897,0.320007);transform-origin:0 0}}',
    );
  });

  it("lists the faces the text and initials tiles use", () => {
    const layout = parseLayoutV2(minimal([textRaw({ spans: [{ text: "a", weight: 700 }, { text: "b", family: "Sora", style: "italic" }] }), { kind: "image", id: "i", name: "I", x: 0, y: 0, width: 1, height: 1, placeholder: "initials" }]));
    expect(fontUses(layout)).toEqual([["Inter", 400, "normal"], ["Inter", 700, "normal"], ["Sora", 400, "italic"], ["Inter", 700, "normal"]]);
  });
});
