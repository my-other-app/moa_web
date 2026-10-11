"use client";

import {
  type AgendaEntry,
  agendaWeights,
  CSS_FONT_FEATURES,
  cssFontFamily,
  fontFileOf,
  type LaidOutAgenda,
  type LaidOutText,
  layoutAgenda,
  layoutText,
  type MeasureText,
  type PageSpec,
  TICKET_FONTS,
  type TicketCanvas,
  type TicketFont,
  type TicketLayer,
} from "@moa/layout";
import * as React from "react";

export type Layout = { canvas: TicketCanvas; layers: TicketLayer[]; page: PageSpec };

// ─── Looks ──────────────────────────────────────────────────────────────
//
// The editor's recurring surfaces, named once. Muster's tokens (ink, sunken,
// line, accent) are spelled here in ours (foreground, muted, border, primary).

export const ui = {
  panel: "rounded-xl border bg-card",
  heading: "font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground",
  eyebrow: "font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground",
  label: "mb-1 block font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground",
  control:
    "h-9 w-full min-w-0 rounded-md border bg-muted/40 px-2.5 text-[13px] text-foreground tabular-nums focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50",
  note: "text-[11.5px] leading-[1.5] text-muted-foreground",
  caution: "text-amber-600 dark:text-amber-400",
  cautionBox: "rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[11.5px] leading-[1.5] text-amber-700 dark:text-amber-300",
  refuseBox: "rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-[11.5px] leading-[1.5] text-destructive",
  iconBtn:
    "grid size-7 shrink-0 place-items-center rounded text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent",
} as const;

// ─── Fonts ──────────────────────────────────────────────────────────────

let fontsPromise: Promise<void> | null = null;

/** Register the ticket fonts from the same files the renderer embeds. Resolves once every face is ready. */
const loadTicketFonts = () => {
  fontsPromise ??= Promise.all(
    (Object.entries(TICKET_FONTS) as [TicketFont, (typeof TICKET_FONTS)[TicketFont]][]).flatMap(
      ([font, meta]) =>
        meta.weights.map(async (w) => {
          const face = new FontFace(cssFontFamily(font), `url(/fonts/ticket/${meta.stem}-${w}.ttf)`, {
            weight: String(w),
          });
          document.fonts.add(await face.load());
        })
    )
  ).then(() => undefined);
  return fontsPromise;
};

/** False until the ticket fonts can be measured; text laid out before then would wrap differently. */
export const useTicketFonts = () => {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    let live = true;
    void loadTicketFonts().then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, []);
  return ready;
};

/** Styles every drawn string shares with the measuring element, so widths agree. */
export const textStyle: React.CSSProperties = {
  fontFeatureSettings: CSS_FONT_FEATURES,
  fontKerning: "none",
  whiteSpace: "pre",
};

let probe: SVGTextElement | null = null;
const widths = new Map<string, number>();

/** Width at size 100 from a hidden SVG text element -- the same engine that draws the canvas. */
const measureAt100 = (font: TicketFont, weight: number, text: string) => {
  const key = `${font}|${weight}|${text}`;
  const hit = widths.get(key);
  if (hit !== undefined) return hit;
  if (!probe) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("aria-hidden", "true");
    Object.assign(svg.style, {
      position: "fixed",
      left: "-10000px",
      top: "0",
      width: "10px",
      height: "10px",
      overflow: "hidden",
      visibility: "hidden",
    });
    probe = document.createElementNS(ns, "text");
    Object.assign(probe.style, {
      fontFeatureSettings: CSS_FONT_FEATURES,
      fontKerning: "none",
      whiteSpace: "pre",
    });
    probe.setAttribute("font-size", "100");
    svg.appendChild(probe);
    document.body.appendChild(svg);
  }
  probe.setAttribute("font-family", cssFontFamily(font));
  probe.setAttribute("font-weight", String(weight));
  probe.textContent = text;
  const w = probe.getComputedTextLength();
  if (widths.size > 5000) widths.clear();
  widths.set(key, w);
  return w;
};

export const measureFor =
  (font: TicketFont, weight: number): MeasureText =>
  (text, size) =>
    (measureAt100(font, weight, text) * size) / 100;

/** Lay out one text layer's string exactly as the PDF will. */
export const layoutLayer = (l: Extract<TicketLayer, { kind: "text" }>, text: string): LaidOutText =>
  layoutText(
    text,
    {
      width: l.width,
      size: l.size,
      maxLines: l.maxLines,
      lineSpacing: l.lineSpacing,
      letterSpacing: l.letterSpacing,
      fit: l.fit,
      fontFile: fontFileOf(l.font, l.weight),
    },
    measureFor(l.font, l.weight)
  );

/** Lay out the run of show exactly as the PDF will: titles and details in the layer's face, times in mono. */
export const layoutAgendaLayer = (l: Extract<TicketLayer, { kind: "agenda" }>, entries: AgendaEntry[], tz: string): LaidOutAgenda => {
  const w = agendaWeights(l.font);
  return layoutAgenda(l, entries, tz, { title: measureFor(l.font, w.title), detail: measureFor(l.font, w.detail), time: measureFor("mono", 700) });
};

/** A layer's box on the canvas. Text boxes are as tall as their laid-out lines. */
export const boxOf = (l: TicketLayer, textHeight?: number) => {
  switch (l.kind) {
    case "text":
      return { x: l.x, y: l.y, w: l.width, h: Math.max(textHeight ?? l.size * 1.2, 8) };
    case "qr":
      return { x: l.x, y: l.y, w: l.size, h: l.size };
    default:
      return { x: l.x, y: l.y, w: l.width, h: l.height };
  }
};

// ─── History ────────────────────────────────────────────────────────────

type History = {
  past: Layout[];
  present: Layout;
  future: Layout[];
  group: string | null;
  at: number;
};
export type LayoutUpdate = Layout | ((l: Layout) => Layout);
type HistoryAction =
  | { type: "set"; next: LayoutUpdate; group?: string }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "seal" };

const LIMIT = 120;

/*
 * The updater is applied inside the reducer rather than against a ref of the
 * present value: the reducer always sees the latest state, and a ref written
 * during render is what the hooks lint forbids.
 */
export const reduceHistory = (h: History, a: HistoryAction): History => {
  switch (a.type) {
    case "set": {
      const next = typeof a.next === "function" ? a.next(h.present) : a.next;
      if (next === h.present) return h;
      const now = Date.now();
      // A drag or a run of keystrokes is one step back, not fifty.
      if (a.group && a.group === h.group && now - h.at < 1200) return { ...h, present: next, at: now };
      return {
        past: [...h.past, h.present].slice(-LIMIT),
        present: next,
        future: [],
        group: a.group ?? null,
        at: now,
      };
    }
    case "undo": {
      const prev = h.past.at(-1);
      return prev
        ? { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future], group: null, at: 0 }
        : h;
    }
    case "redo": {
      const next = h.future[0];
      return next
        ? { past: [...h.past, h.present], present: next, future: h.future.slice(1), group: null, at: 0 }
        : h;
    }
    case "seal":
      return { ...h, group: null };
  }
};

export const useLayoutHistory = (initial: Layout) => {
  const [h, dispatch] = React.useReducer(reduceHistory, {
    past: [],
    present: initial,
    future: [],
    group: null,
    at: 0,
  });
  const set = React.useCallback((next: LayoutUpdate, group?: string) => dispatch({ type: "set", next, group }), []);
  return {
    layout: h.present,
    set,
    undo: React.useCallback(() => dispatch({ type: "undo" }), []),
    redo: React.useCallback(() => dispatch({ type: "redo" }), []),
    /** End the current drag or typing run so the next change is its own step. */
    seal: React.useCallback(() => dispatch({ type: "seal" }), []),
    canUndo: h.past.length > 0,
    canRedo: h.future.length > 0,
  };
};

// ─── QR ─────────────────────────────────────────────────────────────────

type Modules = { size: number; get: (r: number, c: number) => boolean };
const qrCache = new Map<string, string>();

/** An SVG path of a real QR code's dark modules, in module units. Loaded on demand. */
export const useQrPath = (value: string) => {
  const [path, setPath] = React.useState<{ value: string; d: string; count: number } | null>(null);
  React.useEffect(() => {
    let live = true;
    const cached = qrCache.get(value);
    if (cached) {
      const [count, d] = cached.split("|") as [string, string];
      queueMicrotask(() => live && setPath({ value, d, count: Number(count) }));
      return;
    }
    void import("qrcode").then((QR) => {
      const modules = (QR.create(value, { errorCorrectionLevel: "M" }) as unknown as { modules: Modules }).modules;
      let d = "";
      for (let r = 0; r < modules.size; r++) {
        for (let c = 0; c < modules.size; c++) if (modules.get(r, c)) d += `M${c},${r}h1v1h-1z`;
      }
      qrCache.set(value, `${modules.size}|${d}`);
      if (live) setPath({ value, d, count: modules.size });
    });
    return () => {
      live = false;
    };
  }, [value]);
  return path?.value === value ? path : null;
};

// ─── Layers ─────────────────────────────────────────────────────────────

/** Scale every length in a layer, for a template replaced by one of a different size. */
export const scaleLayer = (l: TicketLayer, k: number): TicketLayer => {
  const r = (n: number) => Math.round(n * k * 10) / 10;
  const base = { x: r(l.x), y: r(l.y) };
  switch (l.kind) {
    case "text":
      return { ...l, ...base, width: r(l.width), size: r(l.size), lineSpacing: r(l.lineSpacing), letterSpacing: r(l.letterSpacing) };
    case "qr":
      return { ...l, ...base, size: r(l.size) };
    case "image":
      return { ...l, ...base, width: r(l.width), height: r(l.height), radius: r(l.radius) };
    case "shape":
      return { ...l, ...base, width: r(l.width), height: r(l.height), strokeWidth: r(l.strokeWidth), radius: r(l.radius) };
    case "agenda":
      return { ...l, ...base, width: r(l.width), height: r(l.height), size: r(l.size), rowGap: r(l.rowGap) };
  }
};

export const KIND_LABEL: Record<TicketLayer["kind"], string> = {
  text: "Text layer",
  qr: "QR layer",
  image: "Image layer",
  shape: "Shape layer",
  agenda: "Run of show",
};
export const KIND_GLYPH: Record<TicketLayer["kind"], string> = {
  text: "T",
  qr: "▦",
  image: "▣",
  shape: "■",
  agenda: "☰",
};
