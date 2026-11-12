"use client";

import {
  type BuildContext,
  type DocKind,
  type FontFamilyV2,
  type LayerV2,
  type LayoutV2,
  type ProblemV2,
  buildDoc,
  buildLayer,
  cssFamilyOf,
  fitDoc,
  fontsCssUrl,
  fromV1,
  isV2Layout,
  layoutProblemsV2,
  parseLayoutV2,
} from "@moa/layout";
import { GATEWAY_PREFIX } from "@moa/auth";

import { designSamples } from "../config";
import type { BoardDesign } from "../schemas";

/**
 * The board's one door to the v2 builder in @moa/layout: what the stage
 * draws is what `buildDoc` makes for the PDF, layer by layer, and the
 * checks are the ones the API runs on save.
 */

/** Builds the design's DOM: the root once per look, then each layer's element on its own. */
export interface DocRenderer {
  /** Changes whenever the look changes (accent, brand, values, canvas): every cached layer is stale then. */
  key: object;
  /** Extra CSS for the shadow root. The builder puts everything inline, so this is only the host's reset. */
  styles: string;
  /** A fresh `.moa-doc` root with no layers in it. */
  root: () => HTMLElement;
  /** One layer's element as HTML; "" when it is left out (hidden, or its showIf is empty). */
  layer: (l: LayerV2) => string;
  /** HTML to an element. */
  parse: (html: string) => HTMLElement | null;
}

const parse = (html: string): HTMLElement | null => {
  const t = document.createElement("template");
  t.innerHTML = html;
  return t.content.firstElementChild as HTMLElement | null;
};

/**
 * A renderer for one look: the layout's canvas, page and accent, the values
 * the tokens are filled with, and the pictures and brand in `ctx`.
 */
export const makeRenderer = (look: Pick<LayoutV2, "version" | "page" | "canvas" | "vars">, values: Readonly<Record<string, string>>, ctx: BuildContext): DocRenderer => {
  const base: LayoutV2 = { ...look, layers: [] };
  return {
    key: {},
    styles: "",
    root: () => parse(buildDoc(base, values, ctx)) ?? document.createElement("div"),
    layer: (l) => buildLayer(base, l, values, ctx) ?? "",
    parse,
  };
};

/** The stylesheet with every face, through the dashboard's gateway: `/api/gateway/static/doc-fonts/fonts.css`. */
export const DOC_FONTS_CSS = fontsCssUrl(GATEWAY_PREFIX);

/**
 * Put the design fonts on the page, once. They go in the document, not the
 * stage's shadow root: a face declared inside a shadow root is not used.
 */
export const ensureDocFonts = () => {
  if (typeof document === "undefined" || document.querySelector('link[data-moa="fonts"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = DOC_FONTS_CSS;
  link.dataset.moa = "fonts";
  document.head.appendChild(link);
};

/**
 * Fit the long text in freshly drawn layers, once the faces they use are
 * loaded: the faces load only when asked for, so they are asked for here.
 */
export const fitLayers = (drawn: { el: HTMLElement; layer: LayerV2 }[]) => {
  const fonts = typeof document !== "undefined" ? document.fonts : undefined;
  const texts = drawn.filter((d) => d.layer.kind === "text");
  if (!texts.length) return;
  const faces = new Set(
    texts.map(({ layer: l }) => (l.kind === "text" ? `${l.font.style} ${l.font.weight} 16px '${cssFamilyOf(l.font.family)}'` : ""))
  );
  const fit = () => texts.forEach(({ el }) => el.isConnected && fitDoc(el));
  if (!fonts?.load) return fit();
  void Promise.all([...faces].map((f) => fonts.load(f).catch(() => []))).then(fit, fit);
};

/** The checks the API runs on save, grouped: by layer id, and the rest. */
export const checkLayout = (layout: LayoutV2, kind: DocKind, opts: { fonts?: readonly FontFamilyV2[]; tokens?: readonly string[] }) => {
  const problems: ProblemV2[] = layoutProblemsV2(layout, kind, opts);
  const byLayer = new Map<string, string[]>();
  const general: string[] = [];
  const warnings: string[] = [];
  for (const p of problems) {
    const m = /^layers\.(\d+)/.exec(p.field);
    const l = m ? layout.layers[Number(m[1])] : undefined;
    if (p.level === "warning") {
      warnings.push(l ? `${l.name}: ${p.message}` : p.message);
      continue;
    }
    if (l) byLayer.set(l.id, [...(byLayer.get(l.id) ?? []), p.message]);
    else general.push(p.message);
  }
  const errors = general.length + [...byLayer.values()].reduce((n, m) => n + m.length, 0);
  return { byLayer, general, warnings, errors, first: general[0] ?? [...byLayer.values()][0]?.[0] ?? null, firstLayer: [...byLayer.keys()][0] ?? null };
};
export type LayoutCheck = ReturnType<typeof checkLayout>;

/**
 * A layout as the server sent it, as v2: v2 as it is, a v1 canvas converted
 * the way the server converts it (fonts mapped, boxes scaled), so a design
 * saved before the board opens on the board.
 */
export const readLayout = (raw: unknown, accent?: string): LayoutV2 => (isV2Layout(raw) ? parseLayoutV2(raw) : fromV1(raw, accent ? { accent } : {}));

/** What the stage fills a design with: the server's sample values over the catalogue's samples. */
export const boardValues = (d: Pick<BoardDesign, "values" | "sampleValues">) => designSamples({ ...d.sampleValues, ...(d.values ?? {}) });

/**
 * The builder's context on the stage: the club's colours, the sample QR,
 * the tokens the API knows, and the pictures by their signed links (with
 * this session's uploads over them).
 */
export const boardContext = (d: BoardDesign, sampleQr: string, uploads: Readonly<Record<string, string>> = {}): BuildContext => {
  const colors = d.context?.colors ?? {};
  const primary = colors.primary ?? d.brand.primary;
  const secondary = colors.secondary ?? d.brand.secondary;
  const signed = Object.fromEntries(Object.entries({ ...(d.images?.uploads ?? {}), ...d.imageUrls }).filter((e): e is [string, string] => typeof e[1] === "string"));
  return {
    brand: { primary, secondary },
    ticketType: colors.ticket_type ?? colors.ticketType ?? primary,
    qr: d.context?.qr || sampleQr,
    tokens: d.tokens.map((t) => t.key),
    images: {
      org_logo: d.images?.org_logo ?? d.brand.logoUrl ?? null,
      event_icon: d.images?.event_icon ?? d.eventIconUrl ?? null,
      signature_1: d.images?.signature_1 ?? null,
      signature_2: d.images?.signature_2 ?? null,
      sponsor: d.images?.sponsor ?? null,
      guest_photo: d.images?.guest_photo ?? null,
      uploads: { ...signed, ...uploads },
    },
  };
};
