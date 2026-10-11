"use client";

import {
  areaIsWholeCanvas,
  canvasForPage,
  type ColorRef,
  IMAGE_SOURCE_LABEL,
  type ImageSource,
  minQrSize,
  PAGE_PRESETS,
  type PageSpec,
  pagePresetOf,
  TICKET_FONTS,
  type TicketArea,
  type TicketFont,
  type TicketLayer,
  ticketArea,
} from "@moa/layout";
import { Button, InlineAlert, Switch, cn } from "@moa/ui";
import * as React from "react";

import type { DesignerConfig } from "../config";
import type { DesignToken } from "../schemas";
import { Busy, ColorRefField, NumberField, Segmented, SelectField, TokenMenu } from "./fields";
import { KIND_GLYPH, KIND_LABEL, type Layout, ui } from "./kit";

// ─── Layers ─────────────────────────────────────────────────────────────

export const LayersPanel = ({
  layers,
  selected,
  onSelect,
  onPatch,
  onMove,
  onDuplicate,
  onRemove,
  onAdd,
  problems,
  disabled,
  qrRequired,
}: {
  layers: TicketLayer[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onPatch: (id: string, patch: Partial<TicketLayer>) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: (kind: TicketLayer["kind"]) => void;
  problems: Map<string, string[]>;
  disabled: boolean;
  /** The QR cannot be hidden or deleted -- it is what the gate scans. */
  qrRequired: boolean;
}) => {
  const [renaming, setRenaming] = React.useState<string | null>(null);
  const hasQr = layers.some((l) => l.kind === "qr");
  // Front first, as in every design tool.
  const ordered = [...layers].reverse();
  return (
    <section className={ui.panel} aria-label="Layers">
      <div className="border-b px-3.5 py-2.5">
        <h2 className={ui.heading}>Layers · {layers.length}</h2>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          <Button size="sm" variant="outline" disabled={disabled} onClick={() => onAdd("text")}>
            + Text
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || hasQr}
            title={hasQr ? "A design has exactly one QR code" : undefined}
            onClick={() => onAdd("qr")}
          >
            + QR
          </Button>
          <Button size="sm" variant="outline" disabled={disabled} onClick={() => onAdd("image")}>
            + Image
          </Button>
          <Button size="sm" variant="outline" disabled={disabled} onClick={() => onAdd("shape")}>
            + Shape
          </Button>
        </div>
      </div>
      <ul className="max-h-[360px] overflow-y-auto p-1.5">
        {ordered.map((l, i) => {
          const on = l.id === selected;
          const bad = problems.has(l.id);
          const pinned = l.kind === "qr" && qrRequired;
          return (
            <li key={l.id}>
              <div
                role="button"
                tabIndex={0}
                aria-pressed={on}
                onClick={() => onSelect(l.id)}
                onKeyDown={(e) =>
                  (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && (e.preventDefault(), onSelect(l.id))
                }
                className={cn(
                  "group flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors",
                  on ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted",
                  l.hidden && "opacity-55"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded font-mono text-[12px]",
                    bad ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
                  )}
                >
                  {KIND_GLYPH[l.kind]}
                </span>
                <span className="min-w-0 flex-1">
                  {renaming === l.id ? (
                    <input
                      autoFocus
                      aria-label="Layer name"
                      defaultValue={l.name}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                        if (e.key === "Escape") setRenaming(null);
                      }}
                      onBlur={(e) => {
                        const v = e.currentTarget.value.trim();
                        if (v && v !== l.name) onPatch(l.id, { name: v.slice(0, 60) });
                        setRenaming(null);
                      }}
                      className="h-7 w-full rounded border border-primary bg-card px-1.5 text-[12.5px]"
                    />
                  ) : (
                    <span
                      className="block truncate text-[12.5px] font-medium"
                      onDoubleClick={() => !disabled && setRenaming(l.id)}
                      title="Double-click to rename"
                    >
                      {l.name}
                    </span>
                  )}
                  <span className="block truncate font-mono text-[10px] text-muted-foreground">
                    {bad ? <span className="text-destructive">needs attention · </span> : null}
                    {l.kind === "text" ? l.text || "empty" : KIND_LABEL[l.kind]}
                  </span>
                </span>
                <span className="flex items-center opacity-70 group-hover:opacity-100">
                  <button
                    type="button"
                    className={ui.iconBtn}
                    aria-label={l.hidden ? `Show ${l.name}` : `Hide ${l.name}`}
                    title={l.hidden ? "Show" : "Hide"}
                    disabled={disabled || pinned}
                    onClick={(e) => (e.stopPropagation(), onPatch(l.id, { hidden: !l.hidden }))}
                  >
                    {l.hidden ? "◌" : "◉"}
                  </button>
                  <button
                    type="button"
                    className={cn(ui.iconBtn, l.locked && ui.caution)}
                    aria-label={l.locked ? `Unlock ${l.name}` : `Lock ${l.name}`}
                    title={l.locked ? "Unlock" : "Lock in place"}
                    disabled={disabled}
                    onClick={(e) => (e.stopPropagation(), onPatch(l.id, { locked: !l.locked }))}
                  >
                    {l.locked ? "▣" : "□"}
                  </button>
                  <button
                    type="button"
                    className={ui.iconBtn}
                    aria-label={`Bring ${l.name} forward`}
                    title="Forward"
                    disabled={disabled || i === 0}
                    onClick={(e) => (e.stopPropagation(), onMove(l.id, 1))}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={ui.iconBtn}
                    aria-label={`Send ${l.name} backward`}
                    title="Backward"
                    disabled={disabled || i === ordered.length - 1}
                    onClick={(e) => (e.stopPropagation(), onMove(l.id, -1))}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className={ui.iconBtn}
                    aria-label={`Duplicate ${l.name}`}
                    title="Duplicate"
                    disabled={disabled || l.kind === "qr"}
                    onClick={(e) => (e.stopPropagation(), onDuplicate(l.id))}
                  >
                    ⧉
                  </button>
                  <button
                    type="button"
                    className={cn(ui.iconBtn, "hover:bg-destructive/10 hover:text-destructive")}
                    aria-label={`Delete ${l.name}`}
                    title={pinned ? "Every ticket needs its QR code" : "Delete"}
                    disabled={disabled || pinned}
                    onClick={(e) => (e.stopPropagation(), onRemove(l.id))}
                  >
                    ✕
                  </button>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

// ─── Inspector ──────────────────────────────────────────────────────────

export interface InspectorContext {
  resolve: (c: ColorRef) => string;
  tokens: DesignToken[];
  samples: Record<string, string>;
  /** The layer's text as the sample guest would see it. */
  rendered: (l: Extract<TicketLayer, { kind: "text" }>) => { text: string; truncated: boolean };
  canvas: Layout["canvas"];
  page: PageSpec;
  config: DesignerConfig;
  onUploadImage: (file: File) => Promise<{ key: string; url: string } | null>;
  imageUrl: (l: Extract<TicketLayer, { kind: "image" }>) => string | null;
  disabled: boolean;
}

export const Inspector = ({
  layer,
  onPatch,
  problems,
  ctx,
}: {
  layer: TicketLayer;
  onPatch: (patch: Partial<TicketLayer>, group?: string) => void;
  problems: string[];
  ctx: InspectorContext;
}) => {
  const id = (f: string) => `insp-${layer.id}-${f}`;
  const textRef = React.useRef<HTMLTextAreaElement>(null);
  const d = ctx.disabled;
  const p =
    <K extends string>(field: K) =>
    (v: unknown) =>
      onPatch({ [field]: v } as Partial<TicketLayer>, `${layer.id}-${field}`);

  return (
    <section className={ui.panel} aria-label="Inspector">
      <div className="flex items-center gap-2 border-b px-3.5 py-2.5">
        <h2 className={ui.heading}>Inspector</h2>
        <span className="truncate text-[12px] text-muted-foreground">
          {layer.name} · {KIND_LABEL[layer.kind].toLowerCase()}
        </span>
      </div>
      <div className="flex flex-col gap-3 p-3.5">
        {problems.length ? (
          <InlineAlert tone="destructive" title="Fix">
            <ul className="list-disc pl-4">
              {problems.map((m) => (
                <li key={m}>{m.replace(`${layer.name}: `, "")}</li>
              ))}
            </ul>
          </InlineAlert>
        ) : null}
        {layer.locked ? (
          <p className={cn("text-[12px]", ui.caution)}>Locked in place — unlock it in the layer list to move it on the canvas.</p>
        ) : null}

        <div className="grid grid-cols-2 gap-2.5">
          <NumberField id={id("x")} label="X" value={layer.x} onChange={p("x")} suffix="px" disabled={d} />
          <NumberField id={id("y")} label="Y" value={layer.y} onChange={p("y")} suffix="px" disabled={d} />
        </div>

        {layer.kind === "text" ? (
          <>
            <div>
              <div className="mb-1 flex items-end justify-between gap-2">
                <label htmlFor={id("text")} className={cn(ui.label, "mb-0")}>
                  Text / token
                </label>
                {!d ? (
                  <TokenMenu
                    tokens={ctx.tokens}
                    samples={ctx.samples}
                    groups={ctx.config.tokenGroups}
                    onInsert={(snippet) => {
                      const el = textRef.current;
                      const at = el?.selectionStart ?? layer.text.length;
                      const end = el?.selectionEnd ?? at;
                      onPatch({ text: layer.text.slice(0, at) + snippet + layer.text.slice(end) });
                      requestAnimationFrame(() => {
                        el?.focus();
                        el?.setSelectionRange(at + snippet.length, at + snippet.length);
                      });
                    }}
                  />
                ) : null}
              </div>
              <textarea
                ref={textRef}
                id={id("text")}
                value={layer.text}
                rows={Math.min(5, Math.max(2, Math.ceil(layer.text.length / 34)))}
                disabled={d}
                spellCheck={false}
                onChange={(e) => onPatch({ text: e.target.value.slice(0, 600) }, `${layer.id}-text`)}
                className="w-full resize-y rounded-md border bg-muted/40 px-2.5 py-2 font-mono text-[12.5px] leading-[1.5] text-foreground focus-visible:outline-2 focus-visible:outline-primary"
              />
              <SampleLine text={ctx.rendered(layer)} />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <SelectField
                id={id("font")}
                label="Font"
                value={layer.font}
                disabled={d}
                options={(Object.keys(TICKET_FONTS) as TicketFont[]).map((f) => ({ value: f, label: TICKET_FONTS[f].label }))}
                onChange={(font) =>
                  onPatch({
                    font,
                    weight: (TICKET_FONTS[font].weights as readonly number[]).includes(layer.weight)
                      ? layer.weight
                      : TICKET_FONTS[font].weights[0],
                  } as Partial<TicketLayer>)
                }
              />
              <SelectField
                id={id("weight")}
                label="Weight"
                value={layer.weight}
                disabled={d || TICKET_FONTS[layer.font].weights.length === 1}
                options={TICKET_FONTS[layer.font].weights.map((w) => ({ value: w as number, label: WEIGHT_LABEL[w] ?? String(w) }))}
                onChange={p("weight")}
              />
              <NumberField id={id("size")} label="Font size" value={layer.size} onChange={p("size")} min={4} max={800} suffix="px" disabled={d} />
              <NumberField id={id("width")} label="Box width" value={layer.width} onChange={p("width")} min={10} suffix="px" disabled={d} />
              <NumberField
                id={id("maxLines")}
                label="Max lines"
                value={layer.maxLines}
                onChange={(v) => onPatch({ maxLines: Math.round(v) } as Partial<TicketLayer>, `${layer.id}-maxLines`)}
                min={1}
                max={12}
                disabled={d}
              />
              <NumberField id={id("lineSpacing")} label="Line spacing" value={layer.lineSpacing} onChange={p("lineSpacing")} suffix="px" disabled={d} />
              <NumberField id={id("letterSpacing")} label="Letter spacing" value={layer.letterSpacing} onChange={p("letterSpacing")} step={0.5} suffix="px" disabled={d} />
              <NumberField
                id={id("opacity")}
                label="Opacity"
                value={Math.round(layer.opacity * 100)}
                onChange={(v) => onPatch({ opacity: v / 100 } as Partial<TicketLayer>, `${layer.id}-opacity`)}
                min={0}
                max={100}
                suffix="%"
                disabled={d}
              />
            </div>
            <Segmented
              label="Align"
              value={layer.align}
              onChange={(align) => onPatch({ align } as Partial<TicketLayer>)}
              options={[
                { value: "left", label: "Left" },
                { value: "center", label: "Centre" },
                { value: "right", label: "Right" },
              ]}
            />
            <Segmented
              label="When it does not fit"
              value={layer.fit}
              onChange={(fit) => onPatch({ fit } as Partial<TicketLayer>)}
              options={[
                { value: "shrink", label: "Shrink, then cut" },
                { value: "truncate", label: "Cut with …" },
              ]}
            />
            <ColorRefField
              id={id("color")}
              label="Font colour"
              value={layer.color}
              onChange={(v) => onPatch({ color: v ?? "#141614" } as Partial<TicketLayer>, `${layer.id}-color`)}
              resolve={ctx.resolve}
            />
            {layer.font === "dm_serif" || layer.font === "bebas" ? (
              <p className={ui.note}>
                {TICKET_FONTS[layer.font].label} covers Latin letters only. A name in another script prints in Inter so it is never lost.
              </p>
            ) : null}
          </>
        ) : null}

        {layer.kind === "qr" ? (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <NumberField id={id("size")} label="Size" value={layer.size} onChange={p("size")} min={20} suffix="px" disabled={d} />
              <NumberField
                id={id("quiet")}
                label="Quiet zone"
                value={layer.quietZone}
                onChange={(v) => onPatch({ quietZone: Math.round(v) } as Partial<TicketLayer>, `${layer.id}-quiet`)}
                min={0}
                max={4}
                suffix="mod"
                disabled={d}
              />
            </div>
            <p className={ui.note}>
              At least {minQrSize(ctx.canvas, ctx.page)} px on this canvas. The size is the whole square, quiet zone included, so it never
              changes with the length of the code.
            </p>
            <ColorRefField
              id={id("dark")}
              label="Modules"
              value={layer.dark}
              refs={false}
              onChange={(v) => v && onPatch({ dark: v } as Partial<TicketLayer>, `${layer.id}-dark`)}
              resolve={ctx.resolve}
            />
            <div>
              <ColorRefField
                id={id("light")}
                label="Background"
                value={layer.light === "transparent" ? null : layer.light}
                refs={false}
                allowNone
                onChange={(v) => onPatch({ light: v ?? "transparent" } as Partial<TicketLayer>, `${layer.id}-light`)}
                resolve={ctx.resolve}
              />
              {layer.light === "transparent" ? (
                <p className={cn("mt-1 text-[11.5px] leading-[1.5]", ui.caution)}>
                  No background: only safe where the template is plain and light behind the code.
                </p>
              ) : null}
            </div>
          </>
        ) : null}

        {layer.kind === "image" ? (
          <>
            <SelectField
              id={id("source")}
              label="Shows"
              value={layer.source}
              disabled={d}
              options={(Object.keys(IMAGE_SOURCE_LABEL) as ImageSource[])
                .filter((s) => s !== "guest_photo" || ctx.config.guestPhoto)
                .map((s) => ({ value: s, label: IMAGE_SOURCE_LABEL[s] }))}
              onChange={(source) =>
                onPatch(
                  // A photo is normally a filled circle; the rest keep their shape.
                  source === "guest_photo" && layer.source !== "guest_photo"
                    ? ({ source, fit: "cover", radius: Math.min(layer.width, layer.height) / 2 } as Partial<TicketLayer>)
                    : ({ source } as Partial<TicketLayer>)
                )
              }
            />
            {layer.source === "guest_photo" ? (
              <p className={ui.note}>The guest&apos;s photo when one is on file; their initials on a tinted tile when not.</p>
            ) : null}
            {layer.source === "upload" ? (
              <ImagePicker layer={layer} ctx={ctx} onPicked={(key) => onPatch({ imageKey: key } as Partial<TicketLayer>)} />
            ) : null}
            <div className="grid grid-cols-2 gap-2.5">
              <NumberField id={id("w")} label="Width" value={layer.width} onChange={p("width")} min={1} suffix="px" disabled={d} />
              <NumberField id={id("h")} label="Height" value={layer.height} onChange={p("height")} min={1} suffix="px" disabled={d} />
              <NumberField
                id={id("opacity")}
                label="Opacity"
                value={Math.round(layer.opacity * 100)}
                onChange={(v) => onPatch({ opacity: v / 100 } as Partial<TicketLayer>, `${layer.id}-opacity`)}
                min={0}
                max={100}
                suffix="%"
                disabled={d}
              />
            </div>
            <div className="grid grid-cols-[1fr_96px] items-end gap-2.5">
              <Segmented
                label="Fit"
                value={layer.fit}
                onChange={(fit) => onPatch({ fit } as Partial<TicketLayer>)}
                options={[
                  { value: "contain", label: "Whole image" },
                  { value: "cover", label: "Fill the box" },
                ]}
              />
              <NumberField id={id("radius")} label="Corners" value={layer.radius} onChange={p("radius")} min={0} suffix="px" disabled={d} />
            </div>
            {layer.fit === "contain" ? (
              <Segmented
                label="Sits in its box"
                value={layer.align}
                onChange={(align) => onPatch({ align } as Partial<TicketLayer>)}
                options={[
                  { value: "left", label: "Left" },
                  { value: "center", label: "Centre" },
                  { value: "right", label: "Right" },
                ]}
              />
            ) : null}
          </>
        ) : null}

        {layer.kind === "shape" ? (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <NumberField id={id("w")} label="Width" value={layer.width} onChange={p("width")} min={0.5} suffix="px" disabled={d} />
              <NumberField id={id("h")} label="Height" value={layer.height} onChange={p("height")} min={0.5} suffix="px" disabled={d} />
              {layer.path ? null : (
                <NumberField id={id("radius")} label="Corner radius" value={layer.radius} onChange={p("radius")} min={0} suffix="px" disabled={d} />
              )}
              <NumberField
                id={id("opacity")}
                label="Opacity"
                value={Math.round(layer.opacity * 100)}
                onChange={(v) => onPatch({ opacity: v / 100 } as Partial<TicketLayer>, `${layer.id}-opacity`)}
                min={0}
                max={100}
                suffix="%"
                disabled={d}
              />
            </div>
            {layer.path ? (
              <p className={ui.note}>
                A curved shape from a layout. Drag its handles or set width and height to reshape it; the fill, outline and opacity work as on
                any shape.
              </p>
            ) : null}
            <ColorRefField
              id={id("fill")}
              label="Fill"
              value={layer.fill}
              allowNone
              onChange={(v) => onPatch({ fill: v } as Partial<TicketLayer>, `${layer.id}-fill`)}
              resolve={ctx.resolve}
            />
            <div className="grid grid-cols-[1fr_96px] items-end gap-2.5">
              <ColorRefField
                id={id("stroke")}
                label="Outline"
                value={layer.stroke}
                allowNone
                onChange={(v) =>
                  onPatch({ stroke: v, strokeWidth: v && !layer.strokeWidth ? 3 : layer.strokeWidth } as Partial<TicketLayer>, `${layer.id}-stroke`)
                }
                resolve={ctx.resolve}
              />
              <NumberField id={id("strokeWidth")} label="Outline" value={layer.strokeWidth} onChange={p("strokeWidth")} min={0} suffix="px" disabled={d} />
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
};

const WEIGHT_LABEL: Record<number, string> = { 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold" };

const SampleLine = ({ text }: { text: { text: string; truncated: boolean } }) => (
  <div className="mt-1.5 rounded-md border bg-muted px-2.5 py-1.5 text-[12px]">
    <span className="mr-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">Sample guest sees</span>
    <span className={cn("break-words", !text.text && "text-muted-foreground")}>
      {text.text || "nothing — every token is empty for this guest"}
    </span>
    {text.truncated ? (
      <span className={cn("mt-1 block text-[11px]", ui.caution)}>Cut short even at half size — widen the box or allow more lines.</span>
    ) : null}
  </div>
);

const ImagePicker = ({
  layer,
  ctx,
  onPicked,
}: {
  layer: Extract<TicketLayer, { kind: "image" }>;
  ctx: InspectorContext;
  onPicked: (key: string) => void;
}) => {
  const input = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const url = ctx.imageUrl(layer);
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-md border bg-[repeating-conic-gradient(#e6e6e3_0_25%,#fff_0_50%)] bg-[length:12px_12px]">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="size-full object-contain" />
        ) : (
          <span className="font-mono text-[9px] text-muted-foreground">NONE</span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <Button size="sm" variant="outline" disabled={ctx.disabled || busy} onClick={() => input.current?.click()}>
          <Busy on={busy} />
          {layer.imageKey ? "Replace image" : "Choose image"}
        </Button>
        <p className="mt-1 text-[11px] text-muted-foreground">PNG keeps transparency · max 5 MB</p>
      </div>
      <input
        ref={input}
        type="file"
        aria-label="Upload an image"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          const res = await ctx.onUploadImage(f);
          setBusy(false);
          if (res) onPicked(res.key);
        }}
      />
    </div>
  );
};

// ─── Canvas ─────────────────────────────────────────────────────────────

const SIZES = [
  { label: "Ticket · 1560 × 690", w: 1560, h: 690 },
  { label: "Wide · 1800 × 600", w: 1800, h: 600 },
  { label: "A6 landscape · 1748 × 1240", w: 1748, h: 1240 },
  { label: "Square · 1080 × 1080", w: 1080, h: 1080 },
  { label: "Phone · 1080 × 1920", w: 1080, h: 1920 },
];

export const CanvasPanel = ({
  config,
  layout,
  templateUrl,
  onCanvas,
  onPage,
  onUploadTemplate,
  onRemoveTemplate,
  onResize,
  onFill,
  onCrop,
  coverage,
  photos,
  onUploadBackground,
  onRemoveBackground,
  onStarter,
  onFindArea,
  finding,
  areaSelected,
  uploading,
  disabled,
  qrSize,
}: {
  config: DesignerConfig;
  layout: Layout;
  templateUrl: string | null;
  onCanvas: (patch: Partial<Layout["canvas"]>) => void;
  onPage: (page: PageSpec) => void;
  onUploadTemplate: (file: File) => void;
  onRemoveTemplate: () => void;
  /** A new size for the whole canvas: the layers are scaled to fit it. */
  onResize: (width: number, height: number) => void;
  /** Scale the layers up to fill the canvas they sit in; shrink the canvas to the layers. */
  onFill: () => void;
  onCrop: () => void;
  /** How much of the canvas the layers cover, per axis. */
  coverage: { w: number; h: number } | null;
  /** The photo slots -- a picture per panel -- or none, for one picture behind everything. */
  photos: { id: string; name: string; url: string | null }[];
  onUploadBackground: (file: File, slotId: string | null) => void;
  onRemoveBackground: (slotId: string | null) => void;
  onStarter: (s: string) => void;
  onFindArea: () => void;
  finding: boolean;
  areaSelected: boolean;
  uploading: boolean;
  disabled: boolean;
  qrSize: number | null;
}) => {
  const { canvas, page } = layout;
  const input = React.useRef<HTMLInputElement>(null);
  const photoInput = React.useRef<HTMLInputElement>(null);
  const [photoTarget, setPhotoTarget] = React.useState<string | null>(null);
  const area = ticketArea(canvas);
  const bare = coverage && !canvas.templateKey && (coverage.w < 0.9 || coverage.h < 0.9);
  const fixed = !!page.heightMm;
  const preset = pagePresetOf(page);
  const pageShape = fixed ? page.widthMm / page.heightMm! : null;
  const shapeOff = pageShape ? Math.abs(pageShape - area.width / area.height) / pageShape > 0.015 : false;
  const fitted = canvasForPage(page, config.dpi);
  const framed = !!canvas.area && !areaIsWholeCanvas(canvas, canvas.area);
  const setArea = (p: Partial<TicketArea>) => {
    const next = { ...area, ...p };
    onCanvas({ area: areaIsWholeCanvas(canvas, next) ? null : next });
  };
  return (
    <section className={ui.panel} aria-label="Canvas">
      <div className="flex items-center gap-2 border-b px-3.5 py-2.5">
        <h2 className={ui.heading}>Canvas</h2>
        <span className="font-mono text-[11px] text-muted-foreground">
          {canvas.width} × {canvas.height} px
        </span>
      </div>
      <div className="flex flex-col gap-3.5 p-3.5">
        {config.pages.length > 1 || fixed ? (
          <div>
            <SelectField
              id="canvas-page"
              label="Printed size"
              value={preset ?? "custom"}
              disabled={disabled}
              options={[
                ...config.pages.map((k) => ({ value: k as string, label: PAGE_PRESETS[k].label })),
                ...(preset ? [] : [{ value: "custom", label: `Custom · ${page.widthMm} × ${page.heightMm ?? "—"} mm` }]),
              ]}
              onChange={(v) => {
                const next = PAGE_PRESETS[v as keyof typeof PAGE_PRESETS]?.page;
                if (next) onPage(next);
              }}
            />
            {shapeOff ? (
              <div className={cn("mt-2", ui.refuseBox)}>
                The {canvas.area ? "ticket area" : "canvas"} is {Math.round(area.width)} × {Math.round(area.height)} — not the shape of a{" "}
                {page.widthMm} × {page.heightMm} mm page.
                {!canvas.templateKey ? (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="underline"
                      disabled={disabled}
                      onClick={() => onCanvas({ width: fitted.width, height: fitted.height, area: null })}
                    >
                      Resize the canvas to {fitted.width} × {fitted.height}
                    </button>
                    .
                  </>
                ) : (
                  " Export the template at that shape, or draw a frame of that shape."
                )}
              </div>
            ) : fixed ? (
              <p className={cn("mt-1.5", ui.note)}>
                Export templates at {fitted.width} × {fitted.height} px ({config.dpi} dpi) for a sharp print.
              </p>
            ) : null}
          </div>
        ) : null}
        <div
          className={cn("-m-1 rounded-md border p-2.5 transition-colors", areaSelected ? "border-primary bg-primary/5" : "border-transparent")}
          aria-label="Ticket area"
        >
          <div className="flex items-center justify-between gap-2">
            <span className={ui.eyebrow}>Ticket area</span>
            <span className="font-mono text-[10.5px] text-muted-foreground">
              {framed ? `${Math.round(area.width)} × ${Math.round(area.height)} at ${Math.round(area.x)}, ${Math.round(area.y)}` : "Whole canvas"}
            </span>
          </div>
          <p className={cn("mt-1", ui.note)}>
            {framed
              ? "Only this rectangle is the ticket: the PDF, the preview and every send show it alone. The rest of the canvas is the artboard around it."
              : "The whole canvas prints. If your export carries a backdrop or mock-up around the ticket, find the ticket inside it, or drag a frame on the canvas."}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {canvas.templateKey ? (
              <Button size="sm" variant="outline" disabled={disabled || finding} onClick={onFindArea}>
                <Busy on={finding} />
                Find the ticket
              </Button>
            ) : null}
            {framed ? (
              <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onCanvas({ area: null })}>
                Whole canvas
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() =>
                  setArea({
                    x: Math.round(canvas.width * 0.1),
                    y: Math.round(canvas.height * 0.1),
                    width: Math.round(canvas.width * 0.8),
                    height: Math.round(canvas.height * 0.8),
                    radius: 0,
                  })
                }
              >
                Draw a frame
              </Button>
            )}
          </div>
          {framed ? (
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <NumberField id="area-x" label="X" value={area.x} min={0} max={canvas.width - 100} suffix="px" disabled={disabled} onChange={(v) => setArea({ x: Math.round(v) })} />
              <NumberField id="area-y" label="Y" value={area.y} min={0} max={canvas.height - 50} suffix="px" disabled={disabled} onChange={(v) => setArea({ y: Math.round(v) })} />
              <NumberField id="area-w" label="Width" value={area.width} min={100} max={canvas.width} suffix="px" disabled={disabled} onChange={(v) => setArea({ width: Math.round(v) })} />
              <NumberField id="area-h" label="Height" value={area.height} min={50} max={canvas.height} suffix="px" disabled={disabled} onChange={(v) => setArea({ height: Math.round(v) })} />
              <NumberField id="area-r" label="Corner radius" value={area.radius} min={0} max={Math.floor(Math.min(area.width, area.height) / 2)} suffix="px" disabled={disabled} onChange={(v) => setArea({ radius: Math.round(v) })} />
            </div>
          ) : null}
        </div>

        <div>
          <span className={cn("mb-1.5 block", ui.eyebrow)}>Figma export</span>
          <div className="flex items-center gap-2.5">
            <span
              className="grid h-16 w-28 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted/40"
              style={{ aspectRatio: `${canvas.width}/${canvas.height}` }}
            >
              {templateUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={templateUrl} alt="Ticket template" className="size-full object-contain" />
              ) : (
                <span className="px-2 text-center font-mono text-[9px] uppercase text-muted-foreground">No template</span>
              )}
            </span>
            <div className="flex flex-col gap-1.5">
              <Button size="sm" disabled={disabled || uploading} onClick={() => input.current?.click()}>
                <Busy on={uploading} />
                {canvas.templateKey ? "Replace template" : "Upload template"}
              </Button>
              {canvas.templateKey ? (
                <Button size="sm" variant="ghost" disabled={disabled} onClick={onRemoveTemplate}>
                  Remove template
                </Button>
              ) : null}
            </div>
          </div>
          <p className={cn("mt-1.5", ui.note)}>
            For a whole {config.noun} designed elsewhere: the canvas takes the file&apos;s pixel size, so X and Y match your design file, and
            the layers are scaled onto it. For a photo behind this layout, use Background → Picture instead — the {config.noun} keeps its
            size.
          </p>
          <input
            ref={input}
            type="file"
            aria-label="Upload a template"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onUploadTemplate(f);
            }}
          />
        </div>

        {!canvas.templateKey ? (
          <div className="grid grid-cols-2 gap-2.5">
            {!fixed ? (
              <div className="col-span-2">
                <SelectField
                  id="canvas-size"
                  label="Size"
                  value={SIZES.find((s) => s.w === canvas.width && s.h === canvas.height)?.label ?? "Custom"}
                  disabled={disabled}
                  options={[...SIZES.map((s) => ({ value: s.label, label: s.label })), { value: "Custom", label: "Custom" }]}
                  onChange={(v) => {
                    const s = SIZES.find((x) => x.label === v);
                    if (s) onResize(s.w, s.h);
                  }}
                />
              </div>
            ) : null}
            <NumberField id="canvas-w" label="Width" value={canvas.width} min={300} max={6000} onChange={(v) => onCanvas({ width: Math.round(v) })} suffix="px" disabled={disabled} />
            <NumberField id="canvas-h" label="Height" value={canvas.height} min={150} max={6000} onChange={(v) => onCanvas({ height: Math.round(v) })} suffix="px" disabled={disabled} />
          </div>
        ) : null}

        <div>
          <span className={cn("mb-1.5 block", ui.eyebrow)}>Background</span>
          <ColorRefField
            id="canvas-bg"
            label="Colour"
            value={canvas.background}
            refs={false}
            onChange={(v) => v && onCanvas({ background: v })}
            resolve={(c) => c}
          />
          {(photos.length ? photos : [{ id: null as string | null, name: "Picture", url: null as string | null }]).map((slot) => (
            <div key={slot.id ?? "all"} className="mt-2.5 flex items-center gap-2.5">
              <span className="grid h-14 w-24 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted/40">
                {slot.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={slot.url} alt="" className="size-full object-cover" />
                ) : (
                  <span className="px-2 text-center font-mono text-[9px] uppercase text-muted-foreground">No picture</span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                {photos.length ? <div className="mb-1 text-[12px] text-foreground/80">{slot.name}</div> : null}
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled || (uploading && photoTarget === slot.id)}
                    onClick={() => {
                      setPhotoTarget(slot.id);
                      photoInput.current?.click();
                    }}
                  >
                    <Busy on={uploading && photoTarget === slot.id} />
                    {slot.url ? "Replace" : "Add a picture"}
                  </Button>
                  {slot.url ? (
                    <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onRemoveBackground(slot.id)}>
                      Remove
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
          <p className={cn("mt-1.5", ui.note)}>
            {photos.length
              ? `Each panel takes its own picture, cropped to fill it — the ${config.noun} keeps its size. Drop a picture onto a panel on the canvas to set just that one.`
              : `A photo behind the ${config.noun}, cropped to fill it — the ${config.noun} keeps its size. You can also drop a picture straight onto the canvas.`}
          </p>
          <input
            ref={photoInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onUploadBackground(f, photoTarget);
            }}
          />
        </div>

        {bare ? (
          <div className={ui.cautionBox}>
            The layers cover {Math.round(Math.min(coverage.w, coverage.h) * 100)}% of the canvas; the rest prints as the background colour.{" "}
            <button type="button" className="underline" disabled={disabled} onClick={onFill}>
              Fill the canvas
            </button>{" "}
            (the {config.noun} grows to the edges) or{" "}
            <button type="button" className="underline" disabled={disabled} onClick={onCrop}>
              crop the canvas to the {config.noun}
            </button>
            .
          </div>
        ) : null}

        <div>
          <span className={cn("mb-1.5 block", ui.eyebrow)}>Start from a layout</span>
          <div className="grid grid-cols-2 gap-1.5">
            {Object.keys(config.starters).map((s) => (
              <button
                key={s}
                type="button"
                disabled={disabled}
                onClick={() => onStarter(s)}
                className="rounded-md border bg-card px-2 py-2 text-left hover:border-primary hover:bg-primary/10 disabled:opacity-50"
              >
                <span className="block text-[12.5px] font-medium">{config.starters[s]!.label}</span>
                <span className="block text-[10.5px] leading-[1.35] text-muted-foreground">{config.starters[s]!.note}</span>
              </button>
            ))}
          </div>
        </div>
        <p className="font-mono text-[10.5px] text-muted-foreground">
          {layout.layers.length} layers · QR {qrSize ?? "—"} px (min {minQrSize(canvas, page)}) ·{framed ? " ticket area" : " canvas"} prints{" "}
          {fixed ? `${page.widthMm} × ${page.heightMm} mm` : "8 in wide"}
        </p>
      </div>
    </section>
  );
};

/** What a template-based design needs, said once, next to the upload. */
export const FigmaGuide = ({ config, page }: { config: DesignerConfig; page: PageSpec }) => {
  const px = canvasForPage(page, config.dpi);
  return (
    <div className="flex flex-col gap-3 text-[13px] leading-[1.55] text-foreground/80">
      <ol className="list-decimal space-y-1.5 pl-5">
        <li>
          Design the {config.noun} as one frame
          {page.heightMm ? ` of ${page.widthMm} × ${page.heightMm} mm (${px.width} × ${px.height} px at ${config.dpi} dpi)` : ""}. Leave the
          spaces for the guest name, codes and the QR code empty — those are layers here.
        </li>
        <li>
          Export the frame as PNG (keeps transparency) or JPG{page.heightMm ? "" : ", at 1× or 2×"}. Anything up to 6000 px wide is accepted;
          it is stored at 2400 px so files stay light.
        </li>
        <li>
          Upload it as the template. The canvas takes the file&apos;s pixel size, so the X and Y you read in Figma (at the same export scale)
          are the X and Y here.
        </li>
        <li>
          Add a text layer for each field and type its token, e.g. <code className="font-mono text-foreground">{"{{name}}"}</code> or{" "}
          <code className="font-mono text-foreground">{"{{ticket_code}}"}</code>. Give it a width and a number of lines so long names wrap
          or shrink instead of running off.
        </li>
        <li>Place the QR code over a plain light area. Keep it at least the size shown under the canvas.</li>
        <li>Check Sample preview, then Preview — for a sample guest or a real one with a long name.</li>
      </ol>
      <p className="text-[12px] text-muted-foreground">
        Templates built for other ticketing tools usually work as they are: {"{{name}}"}, {"{{ticket_code}}"}, {"{{event_title}}"},{" "}
        {"{{event_date}}"}, {"{{event_start_time}}"} and {"{% if … %}"} blocks are understood. Anything that is not a known token is flagged
        before you can save.
      </p>
    </div>
  );
};
