import { carriesPerGuestToken } from "../ticket-tokens";
import { DEFAULT_COLORS, esc, f6, gFmt, linearEnds, farthestCorner, num, Paint, radiusCss, roundedRectPath } from "./css";
import { BASE_CSS, FIT_SCRIPT } from "./fit";
import { qrSvgOf } from "./qr";
import { sanitizeSvg } from "./sanitize";
import {
  type DocKind,
  type FillV2,
  type ImageLayerV2,
  type LayerV2,
  type LayoutV2,
  type QrLayerV2,
  type ShapeLayerV2,
  type SpanV2,
  type SvgLayerV2,
  type TextLayerV2,
  textFloor,
} from "./schema";
import { fillTemplate, IMAGE_TOKENS, showV2 } from "./tokens";

/**
 * A v2 layout as HTML: the backend's `layout_v2/build.py`, rule for rule,
 * held to it by the conformance fixtures (`__fixtures__/`). `buildBody` is
 * the part they compare and the editor's stage shows, the
 * `<div class="moa-doc">`; `buildHtml` is the whole page.
 *
 * The body: the root, then each drawn layer in order, one per line, as
 * `<div data-layer="id" data-kind="kind" style="position:absolute;left;top;
 * width;height[;transform:rotate(…);transform-origin:center][;opacity]
 * [kind's own]">…</div>`. Left out: hidden layers, layers whose showIf is
 * not met, text that fills to nothing, an image with no picture and no
 * initials tile, and (printing on pre-printed stock) preprinted layers.
 */

/** What a page needs besides the token values (the backend's Context, its wire form). */
export interface BuildContext {
  /** What the QR encodes: a ticket's code, a certificate's verify address. */
  qr?: string;
  /** brand.primary, brand.secondary and ticket_type. */
  colors?: Partial<{ primary: string; secondary: string; ticketType: string }>;
  /** source ("org_logo", "event_icon", "guest_photo", "signature_1", "signature_2", "sponsor") or "upload:<imageKey>" -> data: URI. */
  images?: Readonly<Record<string, string | null | undefined>>;
  /** The page's title. */
  title?: string;
}

export interface BuildOptions {
  /** The kind of document: which design tokens the text reads. */
  kind?: DocKind;
  /** Printing on pre-printed stock: leave out what is already on it. */
  skipPreprinted?: boolean;
  /**
   * Draw pictures from http(s) URLs too, not only data: URIs. For the
   * editor's stage; the server (and the fixtures) draw data: URIs only.
   */
  allowImageUrls?: boolean;
}

export interface PageOptions extends BuildOptions {
  /** For a browser: the fonts are a <link> to fonts.css (fontsCssUrl) instead of inline rules. */
  forBrowser?: boolean;
  fontsCssUrl?: string;
  /** @font-face rules to put inline when not for a browser. */
  fontCss?: string;
}

type Values = Readonly<Record<string, string | number | boolean | null | undefined>>;

const DATA_IMAGE = /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/;
const WEB_URL = /^(https?:)?\/\//i;
export const PX_PER_MM = 96 / 25.4;

const strValues = (values: Values): Record<string, string> =>
  Object.fromEntries(Object.entries(values ?? {}).map(([k, v]) => [k, v === null || v === undefined ? "" : String(v)]));

/** The values a page reads: as text, and each picture's showIf name present when the context has that picture. */
const valuesOf = (values: Values, ctx: Ctx): Record<string, string> => {
  const out = strValues(values);
  for (const [token, source] of Object.entries(IMAGE_TOKENS)) if (!(token in out)) out[token] = imageOf(ctx, source, null) ? "1" : "";
  return out;
};

const contextOf = (ctx: BuildContext = {}) => ({
  qr: String(ctx.qr || ""),
  colors: { ...DEFAULT_COLORS, ...Object.fromEntries(Object.entries(ctx.colors ?? {}).filter(([, v]) => v !== undefined)) } as Record<string, string>,
  images: { ...(ctx.images ?? {}) },
  title: String(ctx.title || ""),
});
type Ctx = ReturnType<typeof contextOf>;

const imageOf = (ctx: Ctx, source: string, imageKey: string | null) =>
  source === "upload" ? (imageKey ? String(ctx.images[`upload:${imageKey}`] || "") : "") : String(ctx.images[source] || "");

const outer = (l: LayerV2, extra = "") => {
  let s = `position:absolute;left:${num(l.x)}px;top:${num(l.y)}px;width:${num(l.width)}px;height:${num(l.height)}px`;
  if (l.rotation) s += `;transform:rotate(${num(l.rotation)}deg);transform-origin:center`;
  if (l.opacity !== 1) s += `;opacity:${num(l.opacity)}`;
  return s + extra;
};

const open = (l: LayerV2, style: string) => `<div data-layer="${esc(l.id)}" data-kind="${l.kind}" style="${style}">`;

// ─── Text ───────────────────────────────────────────────────────────────────

const JUSTIFY = { top: "flex-start", middle: "center", bottom: "flex-end" } as const;
const TRANSFORM = { none: "none", upper: "uppercase", lower: "lowercase" } as const;

const pyStrip = (s: string) => s.replace(/^\s+|\s+$/g, "");
const words = (s: string) => s.split(/\s+/).filter(Boolean);

/** Up to three letters for a photo frame with no photo: initials, else first and last name, else a full name's first and last words. */
export const initialsOf = (values: Readonly<Record<string, string>>): string => {
  const given = words(values.initials ?? "").join(" ");
  if (given) return [...given].slice(0, 3).join("").toUpperCase();
  let first = words(values.first_name ?? "").join(" ");
  let last = words(values.last_name ?? "").join(" ");
  if (!(first || last)) {
    for (const key of ["full_name", "attendee_name", "recipient_name"]) {
      const parts = words(values[key] ?? "");
      if (parts.length) {
        first = parts[0]!;
        last = parts.length > 1 ? parts[parts.length - 1]! : "";
        break;
      }
    }
  }
  return (([...first][0] ?? "") + ([...last][0] ?? "") || "?").toUpperCase();
};

const span = (layer: TextLayerV2, s: SpanV2, text: string, paint: Paint) => {
  const parts: string[] = [];
  if (s.family !== null) parts.push(`font-family:'${s.family}'`);
  if (s.weight !== null) parts.push(`font-weight:${s.weight}`);
  if (s.style !== null) parts.push(`font-style:${s.style}`);
  if (s.size !== null) parts.push(`font-size:${num(s.size / layer.size)}em`);
  if (s.color !== null) parts.push(`color:${paint.color(s.color)}`);
  if (s.letterSpacing !== null) parts.push(`letter-spacing:${num(s.letterSpacing)}em`);
  if (s.transform !== null) parts.push(`text-transform:${TRANSFORM[s.transform]}`);
  if (!parts.length) return `<span>${esc(text)}</span>`;
  return `<span style="${parts.join(";")}">${esc(text)}</span>`;
};

const textLayer = (layer: TextLayerV2, values: Record<string, string>, kind: string, paint: Paint): string | null => {
  let content: string;
  if (layer.spans) {
    const pieces = layer.spans.map((s) => [s, fillTemplate(s.text, values, kind)] as const);
    if (!pyStrip(pieces.map(([, t]) => t).join(""))) return null;
    content = pieces.map(([s, t]) => span(layer, s, t, paint)).join("");
  } else {
    const filled = fillTemplate(layer.text, values, kind);
    if (!pyStrip(filled)) return null;
    content = esc(filled);
  }
  const p = layer.padding;
  let box =
    `display:flex;flex-direction:column;justify-content:${JUSTIFY[layer.valign]};box-sizing:border-box;` +
    `width:100%;height:100%;padding:${num(p[0])}px ${num(p[1])}px ${num(p[2])}px ${num(p[3])}px`;
  if (layer.background !== null) box += `;background:${paint.fill(layer.background)}`;
  const r = radiusCss(layer.radius);
  if (r) box += `;border-radius:${r}`;
  const f = layer.font;
  let style =
    `font-family:'${f.family}';font-weight:${f.weight};font-style:${f.style};font-size:${num(layer.size)}px;` +
    `line-height:${num(layer.lineHeight)};letter-spacing:${num(layer.letterSpacing)}em;` +
    `color:${paint.color(layer.color)};text-align:${layer.align};` +
    `text-transform:${TRANSFORM[layer.transform]};white-space:pre-wrap;overflow-wrap:anywhere`;
  if (layer.textWrap !== "normal") style += `;text-wrap:${layer.textWrap}`;
  const shadows = paint.shadows(layer, true);
  if (shadows) style += `;text-shadow:${shadows}`;
  const minimum = layer.fit === "shrink" ? textFloor(layer) : layer.size;
  return (
    open(layer, outer(layer)) +
    `<div class="moa-t" style="${box}">` +
    `<div data-fit="${layer.fit}" data-min="${num(minimum)}" data-lines="${layer.maxLines}" style="${style}">` +
    content +
    "</div></div></div>"
  );
};

// ─── Shapes ─────────────────────────────────────────────────────────────────

const svgPaint = (layer: ShapeLayerV2, fill: FillV2 | null, paint: Paint, defs: string[]): string => {
  if (fill === null) return "none";
  if (fill.type === "solid") return paint.color(fill.color);
  const gid = `${esc(layer.id)}-fill`;
  const stops = fill.stops.map((s) => `<stop offset="${num(s.offset)}" stop-color="${paint.color(s.color)}"></stop>`).join("");
  const w = layer.width;
  const h = layer.height;
  if (fill.type === "linear") {
    const e = linearEnds(fill.angle, w, h);
    defs.push(`<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${num(e.x1)}" y1="${num(e.y1)}" x2="${num(e.x2)}" y2="${num(e.y2)}">${stops}</linearGradient>`);
  } else {
    const cx = fill.cx * w;
    const cy = fill.cy * h;
    defs.push(`<radialGradient id="${gid}" gradientUnits="userSpaceOnUse" cx="${num(cx)}" cy="${num(cy)}" r="${num(farthestCorner(cx, cy, w, h))}">${stops}</radialGradient>`);
  }
  return `url(#${gid})`;
};

const shapeLayer = (layer: ShapeLayerV2, paint: Paint): string => {
  const dashed = layer.stroke !== null && layer.stroke.dash !== null;
  if (layer.shape !== "path" && !dashed) {
    let style = ";box-sizing:border-box";
    if (layer.fill !== null) style += `;background:${paint.fill(layer.fill)}`;
    if (layer.stroke !== null) style += `;border:${num(layer.stroke.width)}px solid ${paint.color(layer.stroke.color)}`;
    if (layer.shape === "ellipse") style += ";border-radius:50%";
    else {
      const r = radiusCss(layer.radius);
      if (r) style += `;border-radius:${r}`;
    }
    const shadows = paint.shadows(layer);
    if (shadows) style += `;box-shadow:${shadows}`;
    return open(layer, outer(layer, style)) + "</div>";
  }
  const w = layer.width;
  const h = layer.height;
  const defs: string[] = [];
  const fill = svgPaint(layer, layer.fill, paint, defs);
  let attrs = ` fill="${fill}"`;
  let sw = 0;
  if (layer.stroke !== null) {
    sw = layer.stroke.width;
    attrs += ` stroke="${paint.color(layer.stroke.color)}" stroke-width="${num(sw)}"`;
    if (layer.stroke.dash) attrs += ` stroke-dasharray="${num(layer.stroke.dash[0]!)} ${num(layer.stroke.dash[1]!)}"`;
  }
  let body: string;
  if (layer.shape === "path") body = `<path d="${esc(layer.path ?? "")}"${attrs}></path>`;
  else if (layer.shape === "ellipse")
    body = `<ellipse cx="${num(w / 2)}" cy="${num(h / 2)}" rx="${num(Math.max(0, w / 2 - sw / 2))}" ry="${num(Math.max(0, h / 2 - sw / 2))}"${attrs}></ellipse>`;
  else {
    const inner = layer.radius.map((r) => Math.max(0, r - sw / 2)) as [number, number, number, number];
    body = `<path d="${roundedRectPath(sw / 2, sw / 2, w - sw, h - sw, inner)}"${attrs}></path>`;
  }
  const drops = paint.dropShadows(layer);
  const extra = drops ? `;filter:${drops}` : "";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(w)} ${num(h)}" width="100%" height="100%" ` +
    `preserveAspectRatio="none" style="display:block;overflow:visible">` +
    (defs.length ? `<defs>${defs.join("")}</defs>` : "") +
    body +
    "</svg>";
  return open(layer, outer(layer, extra)) + svg + "</div>";
};

// ─── SVG art ────────────────────────────────────────────────────────────────

const SVG_FIT = { contain: "xMidYMid meet", cover: "xMidYMid slice", stretch: "none" } as const;

/** An svg layer's markup as drawn: sanitised, recoloured, its ids made the layer's own, scaled per its fit. */
export const svgMarkup = (layer: SvgLayerV2, paint: Paint): string => {
  let markup = sanitizeSvg(layer.markup);
  if (layer.recolor) {
    const table = new Map(Object.entries(layer.recolor).map(([k, v]) => [k.toUpperCase(), paint.color(v)]));
    markup = markup.replace(/#([0-9A-Fa-f]{6})(?![0-9A-Fa-f])/g, (m, hex: string) => table.get(`#${hex.toUpperCase()}`) ?? m);
  }
  const prefix = layer.id;
  markup = markup.replace(/\sid="([^"]+)"/g, (_m, id: string) => ` id="${prefix}-${id}"`);
  markup = markup.replace(/url\(#([^)\s]+)\)/g, (_m, id: string) => `url(#${prefix}-${id})`);
  markup = markup.replace(/\shref="#([^"]+)"/g, (_m, id: string) => ` href="#${prefix}-${id}"`);
  return markup.replace("<svg", `<svg preserveAspectRatio="${SVG_FIT[layer.fit]}" width="100%" height="100%" style="display:block"`);
};

const svgLayer = (layer: SvgLayerV2, paint: Paint) => {
  const drops = paint.dropShadows(layer);
  return open(layer, outer(layer, drops ? `;filter:${drops}` : "")) + svgMarkup(layer, paint) + "</div>";
};

// ─── Images and the QR ──────────────────────────────────────────────────────

const POS_X = { left: "0%", center: "50%", right: "100%" } as const;
const POS_Y = { top: "0%", middle: "50%", bottom: "100%" } as const;

const imageLayer = (layer: ImageLayerV2, values: Record<string, string>, ctx: Ctx, paint: Paint, opts: BuildOptions): string | null => {
  let src = imageOf(ctx, layer.source, layer.imageKey);
  if (src && !DATA_IMAGE.test(src) && !(opts.allowImageUrls && WEB_URL.test(src))) src = "";
  let extra = "";
  const shadows = paint.shadows(layer);
  const r = radiusCss(layer.radius);
  if (shadows) {
    extra = `;box-shadow:${shadows}`;
    if (r) extra += `;border-radius:${r}`;
  }
  let look = "";
  if (r) look += `;border-radius:${r}`;
  if (layer.border !== null) look += `;border:${num(layer.border.width)}px solid ${paint.color(layer.border.color)}`;
  if (src) {
    const img =
      `<img src="${opts.allowImageUrls && WEB_URL.test(src) ? esc(src) : src}" alt="" style="display:block;width:100%;height:100%;box-sizing:border-box;` +
      `object-fit:${layer.fit};object-position:${POS_X[layer.align]} ${POS_Y[layer.valign]}${look}">`;
    return open(layer, outer(layer, extra)) + img + "</div>";
  }
  if (layer.placeholder !== "initials") return null;
  const st = layer.placeholderStyle;
  const color = st ? paint.color(st.color) : "#3C4257";
  const background = st && st.background !== null ? paint.fill(st.background) : "#E9ECF2";
  const family = st ? st.family : "Inter";
  const weight = st ? st.weight : 700;
  const tile =
    `<div class="moa-initials" style="width:100%;height:100%;box-sizing:border-box;display:flex;` +
    `align-items:center;justify-content:center;container-type:size;color:${color};background:${background};` +
    `font-family:'${family}';font-weight:${weight}${look}">` +
    `<span style="font-size:42cqmin;line-height:1;letter-spacing:-0.02em">${esc(initialsOf(values))}</span></div>`;
  return open(layer, outer(layer, extra)) + tile + "</div>";
};

/** The QR as the builder draws it: `<svg width="100%" height="100%" style="display:block" …>`. */
export const qrSvg = (payload: string, quietZone: number) =>
  qrSvgOf(payload || "MOA", quietZone).replace("<svg", '<svg width="100%" height="100%" style="display:block"');

const qrLayer = (layer: QrLayerV2, ctx: Ctx, paint: Paint) => {
  let look = "";
  if (layer.background !== null) look += `;background:${paint.fill(layer.background)}`;
  const r = radiusCss(layer.radius);
  if (r) look += `;border-radius:${r}`;
  const shadows = paint.shadows(layer);
  const extra = shadows ? `;box-shadow:${shadows}` : "";
  return (
    open(layer, outer(layer, extra)) +
    `<div class="moa-qr" style="width:100%;height:100%;box-sizing:border-box${look}">` +
    qrSvg(ctx.qr, layer.quietZone) +
    "</div></div>"
  );
};

// ─── The body and the page ──────────────────────────────────────────────────

/** Whether a layer is already on the card stock (a text that names a guest never is). */
export const onStock = (layer: LayerV2) => {
  if (!layer.preprinted) return false;
  if (layer.kind === "text" && carriesPerGuestToken(layer.text)) return false;
  return true;
};

/** Whether a layer is drawn for these values: not hidden, its showIf met, not on the stock when printing on stock. */
export const layerDrawn = (layer: LayerV2, values: Values, context: BuildContext = {}, opts: BuildOptions = {}) =>
  !layer.hidden && showV2(layer.showIf, valuesOf(values, contextOf(context)), opts.kind ?? "ticket") && !(opts.skipPreprinted && onStock(layer));

/** One layer's element, or null when it is left out. */
export const buildLayer = (layout: LayoutV2, layer: LayerV2, values: Values, context: BuildContext = {}, opts: BuildOptions = {}): string | null => {
  const ctx = contextOf(context);
  const vals = valuesOf(values, ctx);
  const kind = opts.kind ?? "ticket";
  if (layer.hidden || !showV2(layer.showIf, vals, kind)) return null;
  if (opts.skipPreprinted && onStock(layer)) return null;
  const paint = new Paint(layout, ctx.colors);
  switch (layer.kind) {
    case "text":
      return textLayer(layer, vals, kind, paint);
    case "shape":
      return shapeLayer(layer, paint);
    case "svg":
      return svgLayer(layer, paint);
    case "image":
      return imageLayer(layer, vals, ctx, paint, opts);
    case "qr":
      return qrLayer(layer, ctx, paint);
  }
};

/** The `<div class="moa-doc">` with every layer drawn: what the editor's stage shows and the fixtures compare. */
export const buildBody = (layout: LayoutV2, values: Values, context: BuildContext = {}, opts: BuildOptions = {}): string => {
  const ctx = contextOf(context);
  const paint = new Paint(layout, ctx.colors);
  const c = layout.canvas;
  let root = `position:relative;width:${num(c.width)}px;height:${num(c.height)}px;overflow:hidden`;
  if (c.background !== null) root += `;background:${paint.fill(c.background)}`;
  const inner = layout.layers
    .map((l) => buildLayer(layout, l, values, context, opts))
    .filter((s): s is string => !!s)
    .join("\n");
  return inner ? `<div class="moa-doc" style="${root}">\n${inner}\n</div>` : `<div class="moa-doc" style="${root}">\n</div>`;
};

/** (family, weight, style) of every face the layout's text asks for, to load before fitting. */
export const fontUses = (layout: LayoutV2): [string, number, "normal" | "italic"][] => {
  const out: [string, number, "normal" | "italic"][] = [];
  for (const layer of layout.layers) {
    if (layer.kind === "text") {
      const f = layer.font;
      out.push([f.family, f.weight, f.style]);
      for (const s of layer.spans ?? []) out.push([s.family || f.family, s.weight || f.weight, s.style || f.style]);
    } else if (layer.kind === "image" && layer.placeholder === "initials") {
      const st = layer.placeholderStyle;
      out.push(st ? [st.family, st.weight, "normal"] : ["Inter", 700, "normal"]);
    }
  }
  return out;
};

/** The canvas's key on the page: `384x576`. */
export const pageKey = (layout: Pick<LayoutV2, "canvas">) => `${num(layout.canvas.width)}x${num(layout.canvas.height)}`;

/** The page's own CSS: the canvas size, and printed, the paper's size with the canvas scaled to it. */
export const pageCss = (layout: Pick<LayoutV2, "canvas" | "page">) => {
  const c = layout.canvas;
  const p = layout.page;
  const key = pageKey(layout);
  let css = "html,body{margin:0;padding:0}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}" + `.moa-page[data-canvas="${key}"]{width:${num(c.width)}px;height:${num(c.height)}px}`;
  const kx = (p.widthMm * PX_PER_MM) / c.width;
  const ky = (p.heightMm * PX_PER_MM) / c.height;
  css += `@media print{.moa-page[data-canvas="${key}"]{width:${gFmt(p.widthMm)}mm;height:${gFmt(p.heightMm)}mm}`;
  if (Math.abs(kx - 1) > 1e-4 || Math.abs(ky - 1) > 1e-4) css += `.moa-page[data-canvas="${key}"] .moa-doc{transform:scale(${f6(kx)},${f6(ky)});transform-origin:0 0}`;
  return css + "}";
};

/**
 * The complete page. In a browser (`forBrowser`), the fonts are fonts.css
 * from `fontsCssUrl`; otherwise `fontCss` goes in inline (the server puts the
 * faces the layout uses there, as data: URIs). Then the fit script, which
 * fits long text and sets window.__moaReady.
 */
export const buildHtml = (layout: LayoutV2, values: Values, context: BuildContext = {}, opts: PageOptions = {}): string => {
  const ctx = contextOf(context);
  const body = buildBody(layout, values, context, opts);
  const p = layout.page;
  const fonts =
    opts.forBrowser && opts.fontsCssUrl
      ? `<link rel="stylesheet" data-moa="fonts" href="${esc(opts.fontsCssUrl)}">\n`
      : `<style data-moa="fonts">\n${opts.fontCss ?? ""}\n</style>\n`;
  return (
    '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="moa-design" content="layout-v2">\n' +
    `<meta name="moa-page" content="${gFmt(p.widthMm)}mm ${gFmt(p.heightMm)}mm">\n` +
    `<title>${esc(ctx.title || "Design")}</title>\n` +
    "<!--moa:head-->\n" +
    fonts +
    `<style data-moa="base">${BASE_CSS}${pageCss(layout)}</style>\n` +
    "<!--/moa:head-->\n" +
    `<script data-moa="fit">${FIT_SCRIPT}</script>\n` +
    "</head>\n<body>\n" +
    `<!--moa:page--><div class="moa-page" data-canvas="${pageKey(layout)}">\n${body}\n</div><!--/moa:page-->\n` +
    "</body>\n</html>\n"
  );
};
