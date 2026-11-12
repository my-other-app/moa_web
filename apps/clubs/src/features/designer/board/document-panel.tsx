"use client";

import { type LayoutV2, V2_LIMITS } from "@moa/layout";
import { Button, CardLabel, FigurePanel, Notice, cn } from "@moa/ui";
import * as React from "react";

import { NumberField, Section, SelectField } from "../components/fields";
import { ui } from "../components/kit";
import type { DesignKind } from "../schemas";
import { type ColorContext, ColorFieldV2, FillField } from "./fields";
import { accentLayers } from "./model";

/**
 * The document itself, shown when no layer is picked: the accent colour
 * (which every layer bound to it follows), the paper it prints on, the
 * canvas size, and the background.
 */

export interface PageChoice {
  key: string;
  label: string;
  widthMm: number;
  heightMm: number;
}

/** Paper each kind is usually printed on. Any size can be typed instead. */
export const PAGES: Record<"ticket" | "badge" | "certificate", PageChoice[]> = {
  ticket: [
    { key: "ticket", label: "Ticket · 8 × 3.75 in", widthMm: 203.2, heightMm: 95.25 },
    { key: "a5_landscape", label: "A5 landscape", widthMm: 210, heightMm: 148 },
    { key: "a4_landscape", label: "A4 landscape", widthMm: 297, heightMm: 210 },
  ],
  badge: [
    { key: "lanyard_4x6", label: "4 × 6 in", widthMm: 101.6, heightMm: 152.4 },
    { key: "cr80_portrait", label: "Card (CR80), upright", widthMm: 54, heightMm: 85.6 },
    { key: "cr80_landscape", label: "Card (CR80), sideways", widthMm: 85.6, heightMm: 54 },
    { key: "a6_portrait", label: "A6 upright", widthMm: 105, heightMm: 148 },
    { key: "badge_87x130", label: "87 × 130 mm", widthMm: 87, heightMm: 130 },
  ],
  certificate: [
    { key: "a4_landscape", label: "A4 landscape", widthMm: 297, heightMm: 210 },
    { key: "a4_portrait", label: "A4 upright", widthMm: 210, heightMm: 297 },
    { key: "letter_landscape", label: "US Letter landscape", widthMm: 279.4, heightMm: 215.9 },
  ],
};

/** How far the canvas's shape is from the paper's: 0 is the same. */
export const aspectGap = (layout: LayoutV2) => {
  const a = layout.canvas.width / layout.canvas.height;
  const b = layout.page.widthMm / layout.page.heightMm;
  return Math.abs(a / b - 1);
};

const clampSide = (n: number) => Math.round(Math.min(V2_LIMITS.canvasMax, Math.max(V2_LIMITS.canvasMin, n)));

/** The canvas reshaped to the paper, keeping its longer side, and every layer scaled with it. */
export const fitCanvasToPage = (layout: LayoutV2): LayoutV2 => {
  const ratio = layout.page.widthMm / layout.page.heightMm;
  const { width: W, height: H } = layout.canvas;
  let w = W;
  let h = H;
  if (ratio >= 1) h = clampSide(W / ratio);
  else w = clampSide(H * ratio);
  if (w === W && h === H) return layout;
  const kx = w / W;
  const ky = h / H;
  const k = Math.min(kx, ky);
  return {
    ...layout,
    canvas: { ...layout.canvas, width: w, height: h },
    layers: layout.layers.map((l) => ({
      ...l,
      x: Math.round(l.x * kx * 100) / 100,
      y: Math.round(l.y * ky * 100) / 100,
      width: Math.round(l.width * k * 100) / 100,
      height: Math.round(l.height * k * 100) / 100,
      ...(l.kind === "text" ? { size: Math.round(l.size * k * 100) / 100, minSize: l.minSize === null ? null : Math.max(1, Math.round(l.minSize * k * 100) / 100) } : {}),
    })),
  };
};

export const DocumentPanel = ({
  layout,
  kind,
  colors,
  suggestions,
  onChange,
}: {
  layout: LayoutV2;
  kind: Exclude<DesignKind, "agenda">;
  colors: ColorContext;
  /** Accent colours worth one click: the club's brand. */
  suggestions: string[];
  onChange: (update: (l: LayoutV2) => LayoutV2, group?: string) => void;
}) => {
  const { page, canvas, vars } = layout;
  const using = React.useMemo(() => accentLayers(layout).length, [layout]);
  const pages = PAGES[kind];
  const current = pages.find((p) => Math.abs(p.widthMm - page.widthMm) < 0.2 && Math.abs(p.heightMm - page.heightMm) < 0.2)?.key ?? "custom";
  const gap = aspectGap(layout);
  const off = gap > V2_LIMITS.aspectTolerance;
  return (
    <FigurePanel role="region" aria-label="Document" className="p-0">
      <div className="px-4 pt-4 pb-3">
        <CardLabel>Document</CardLabel>
        <p className={cn(ui.note, "mt-1")}>Pick a layer on the canvas to change it. These settings are for the whole design.</p>
      </div>

      <Section title="Accent colour">
        <ColorFieldV2
          id="doc-accent"
          label="Accent"
          value={vars.accent ?? "#000000"}
          refs={false}
          ctx={colors}
          onChange={(c) => c && onChange((l) => ({ ...l, vars: { ...l.vars, accent: c.slice(0, 7) } }), "accent")}
        />
        {suggestions.length ? (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Suggested accents">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                aria-label={`Use ${s}`}
                title={s}
                onClick={() => onChange((l) => ({ ...l, vars: { ...l.vars, accent: s } }))}
                className={cn(
                  "border-line size-6 rounded-full border focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] focus-visible:outline-none",
                  vars.accent?.toUpperCase() === s.toUpperCase() && "ring-brand ring-2 ring-offset-1"
                )}
                style={{ background: s }}
              />
            ))}
          </div>
        ) : null}
        <p className={ui.note}>
          {using ? `Used by ${using} ${using === 1 ? "layer" : "layers"}. They change with it.` : "No layer uses it yet. Choose Accent as a layer's colour to tie it in."}
        </p>
      </Section>

      <Section title="Paper">
        <SelectField
          id="doc-page"
          label="Printed on"
          value={current}
          options={[...pages.map((p) => ({ value: p.key, label: p.label })), { value: "custom", label: "Custom size" }]}
          onChange={(key) => {
            const p = pages.find((x) => x.key === key);
            if (p) onChange((l) => fitCanvasToPage({ ...l, page: { widthMm: p.widthMm, heightMm: p.heightMm } }));
          }}
        />
        <div className="grid grid-cols-2 gap-2.5">
          <NumberField id="doc-wmm" label="Paper width" value={page.widthMm} min={10} max={2000} suffix="mm" onChange={(widthMm) => onChange((l) => ({ ...l, page: { ...l.page, widthMm } }), "page")} />
          <NumberField id="doc-hmm" label="Paper height" value={page.heightMm} min={10} max={2000} suffix="mm" onChange={(heightMm) => onChange((l) => ({ ...l, page: { ...l.page, heightMm } }), "page")} />
          <NumberField
            id="doc-w"
            label="Canvas width"
            value={canvas.width}
            min={V2_LIMITS.canvasMin}
            max={V2_LIMITS.canvasMax}
            suffix="px"
            onChange={(width) => onChange((l) => ({ ...l, canvas: { ...l.canvas, width } }), "canvas")}
          />
          <NumberField
            id="doc-h"
            label="Canvas height"
            value={canvas.height}
            min={V2_LIMITS.canvasMin}
            max={V2_LIMITS.canvasMax}
            suffix="px"
            onChange={(height) => onChange((l) => ({ ...l, canvas: { ...l.canvas, height } }), "canvas")}
          />
        </div>
        {off ? (
          <Notice
            tone="caution"
            tag="Shape"
            action={
              <Button size="sm" variant="secondary" onClick={() => onChange(fitCanvasToPage)}>
                Match the paper
              </Button>
            }
          >
            The canvas is not the shape of the paper, so the print would stretch.
          </Notice>
        ) : null}
      </Section>

      <Section title="Background">
        <FillField id="doc-bg" label="Background" value={canvas.background} onChange={(background) => onChange((l) => ({ ...l, canvas: { ...l.canvas, background } }), "background")} ctx={colors} />
      </Section>
    </FigurePanel>
  );
};
