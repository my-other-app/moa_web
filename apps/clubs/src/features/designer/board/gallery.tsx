"use client";

import { GATEWAY_PREFIX } from "@moa/auth";
import { isV2Layout, type LayoutV2, parseLayoutV2, POSTER_FORMAT_SPECS, type PosterFormat } from "@moa/layout";
import { EmptyState, Segmented, StatusBadge, cn } from "@moa/ui";
import { PencilRulerIcon } from "lucide-react";
import * as React from "react";

import type { DesignerConfig } from "../config";
import { fileIdOf, type ColourFilter, type PhotoFilter } from "../presets";
import { usePosterStarterFormats } from "../queries";
import type { BoardDesign, BoardKind, StarterMeta } from "../schemas";
import { boardContext, boardValues, type DocRenderer, makeRenderer } from "./engine";
import { DocThumb } from "./stage";

/**
 * The designs for one kind, as pictures: the one in use first (open it to
 * change anything on it), then every design to start from. Picking one
 * copies it onto the board, unsaved; saving there makes it this design.
 */

const GRID: Record<BoardKind, string> = {
  ticket: "grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))]",
  certificate: "grid-cols-[repeat(auto-fill,minmax(min(100%,230px),1fr))]",
  badge: "grid-cols-[repeat(auto-fill,minmax(min(100%,160px),1fr))]",
  poster: "grid-cols-[repeat(auto-fill,minmax(min(100%,180px),1fr))]",
};

const cardClass = (on: boolean) =>
  cn(
    "group bg-surface shadow-card flex w-full flex-col overflow-hidden rounded-[var(--radius-card)] border p-2 text-left transition-colors",
    "hover:border-brand-line focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] focus-visible:outline-none",
    on ? "border-brand-line ring-brand-line ring-1" : "border-line-soft"
  );

/** A starter's picture: its preview, the designer's thumbnail for it, or its name when neither loads. */
const previewOf = (kind: BoardKind, s: StarterMeta) => {
  const p = s.preview ?? "";
  if (/^https:\/\//.test(p)) return p;
  // The API's own files (/static/doc-designs/...) go through the gateway.
  if (p.startsWith("/static/")) return `${GATEWAY_PREFIX}${p}`;
  return `/designs/${kind}/${encodeURIComponent(fileIdOf(s.id))}.webp`;
};

const StarterThumb = ({ kind, s }: { kind: BoardKind; s: StarterMeta }) => {
  const [broken, setBroken] = React.useState(false);
  const ratio = s.page ? `${s.page.widthMm} / ${s.page.heightMm}` : kind === "badge" ? "2 / 3" : kind === "ticket" ? "32 / 15" : "297 / 210";
  return (
    <span className="bg-sunken relative block overflow-hidden rounded-[var(--radius-md)]" style={{ aspectRatio: ratio }}>
      {broken ? (
        <span className="text-ink-3 absolute inset-0 grid place-items-center p-3 text-center text-[15px] leading-tight font-semibold">{s.name}</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- static thumbnails, already sized
        <img
          src={previewOf(kind, s)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          className="absolute inset-0 size-full object-cover transition-transform duration-200 group-hover:scale-[1.015]"
        />
      )}
    </span>
  );
};

const Caption = ({ title, meta, chip }: { title: string; meta: string; chip?: React.ReactNode }) => (
  <span className="flex items-start justify-between gap-2 px-1 pt-2 pb-0.5">
    <span className="min-w-0">
      <span className="text-ink block truncate text-[13px] font-medium">{title}</span>
      <span className="text-ink-3 block truncate text-[11.5px]">{meta}</span>
    </span>
    {chip}
  </span>
);

const PHOTO: { value: PhotoFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "photo", label: "With photo" },
  { value: "none", label: "No photo" },
];
const COLOUR: { value: ColourFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "colour", label: "Colour" },
  { value: "mono", label: "Black and white" },
];

/**
 * A poster starter's picture: its layout for the format on the board, drawn
 * by the builder with the sample guest (the starters ship no pictures).
 * Its name while the layout loads or when it cannot be read.
 */
const PosterStarterThumb = ({ s, raw, design, config, format }: { s: StarterMeta; raw: unknown; design: BoardDesign; config: DesignerConfig; format: PosterFormat }) => {
  const layout = React.useMemo(() => {
    try {
      return isV2Layout(raw) ? parseLayoutV2(raw) : null;
    } catch {
      return null;
    }
  }, [raw]);
  const renderer = React.useMemo(
    () => (layout ? makeRenderer({ page: layout.page, canvas: layout.canvas, vars: layout.vars }, boardValues(design, "poster"), boardContext(design, config.sampleQr, {}, true), "poster") : null),
    [layout, design, config.sampleQr]
  );
  const spec = POSTER_FORMAT_SPECS[format];
  // Drawn as wide as the card is: measured, else the narrowest a card gets.
  const box = React.useRef<HTMLSpanElement>(null);
  const [width, setWidth] = React.useState(164);
  React.useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => el.clientWidth && setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <span ref={box} className="bg-sunken relative grid place-items-center overflow-hidden rounded-[var(--radius-md)]" style={{ aspectRatio: `${spec.width} / ${spec.height}` }}>
      {layout && renderer ? (
        <DocThumb layout={layout} renderer={renderer} width={width} height={Math.round((width * spec.height) / spec.width)} className="block" />
      ) : (
        <span className="text-ink-3 p-3 text-center text-[15px] leading-tight font-semibold">{s.name}</span>
      )}
    </span>
  );
};

export const StarterGallery = ({
  config,
  kind,
  starters,
  current,
  renderer,
  currentNote,
  onOpen,
  onPick,
  design,
  eventId = 0,
  format,
}: {
  config: DesignerConfig;
  kind: BoardKind;
  starters: StarterMeta[];
  /** The design in use, as the board would open it; null while it cannot be read. */
  current: LayoutV2 | null;
  renderer: DocRenderer | null;
  /** Where the design in use comes from, in a few words. */
  currentNote: string;
  onOpen: () => void;
  onPick: (s: StarterMeta) => void;
  /** A poster's: the design (for the sample guest), the event (for the starters' layouts) and the format shown. */
  design?: BoardDesign;
  eventId?: number;
  format?: PosterFormat;
}) => {
  const posterThumbs = kind === "poster" && !!design && !!format && eventId > 0;
  const layouts = usePosterStarterFormats(eventId, posterThumbs ? starters.map((s) => s.id) : []);
  const [photo, setPhoto] = React.useState<PhotoFilter>("all");
  const [colour, setColour] = React.useState<ColourFilter>("all");
  const filterable = kind === "badge" && starters.some((s) => s.hasPhoto != null || s.mono != null);
  const shown = filterable
    ? starters.filter((s) => (photo === "all" || (photo === "photo") === !!s.hasPhoto) && (colour === "all" || (colour === "mono") === !!s.mono))
    : starters;
  const thumbClass = "bg-sunken grid h-[150px] place-items-center overflow-hidden rounded-[var(--radius-md)]";
  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="current-title" className="flex flex-col gap-3">
        <div>
          <h2 id="current-title" className="text-ink m-0 text-[15px] font-semibold">
            In use
          </h2>
          <p className="text-ink-3 m-0 mt-0.5 text-[12.5px]">Open it to move, restyle or rewrite any part of it.</p>
        </div>
        <ul className={cn("m-0 grid list-none gap-3 p-0", GRID.certificate)}>
          <li className="min-w-0">
            <button type="button" className={cardClass(true)} onClick={onOpen} aria-label={`Open the ${config.noun} in use`}>
              {current && renderer ? (
                <DocThumb layout={current} renderer={renderer} width={220} height={150} className={thumbClass} />
              ) : (
                <span aria-hidden="true" className={cn(thumbClass, "text-ink-3")}>
                  <PencilRulerIcon className="size-8" />
                </span>
              )}
              <Caption title={`Edit this ${config.noun}`} meta={currentNote} chip={<StatusBadge tone="success" label="In use" className="shrink-0" />} />
            </button>
          </li>
        </ul>
      </section>

      <section aria-labelledby="starters-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 id="starters-title" className="text-ink m-0 text-[15px] font-semibold">
              Start from a design
            </h2>
            <p className="text-ink-3 m-0 mt-0.5 text-[12.5px]">
              {kind === "poster"
                ? `${starters.length} designs, each with a square, a portrait and a story layout. Pick one to use it, or to open a copy.`
                : `${starters.length} designs. Pick one to open a copy; nothing changes until you save.`}
            </p>
          </div>
          {filterable ? (
            <div className="flex flex-wrap items-center gap-2">
              <Segmented label="Photo" value={photo} options={PHOTO} onChange={setPhoto} />
              <Segmented label="Printer" value={colour} options={COLOUR} onChange={setColour} />
            </div>
          ) : null}
        </div>
        {shown.length ? (
          <ul className={cn("m-0 grid list-none gap-3 p-0", GRID[kind])}>
            {shown.map((s) => (
              <li key={s.id} className="min-w-0">
                <button type="button" className={cardClass(false)} onClick={() => onPick(s)} aria-label={`Start from ${s.name}`}>
                  {posterThumbs ? (
                    <PosterStarterThumb s={s} raw={layouts[starters.indexOf(s)]?.data?.[format!]} design={design!} config={config} format={format!} />
                  ) : (
                    <StarterThumb kind={kind} s={s} />
                  )}
                  <Caption title={s.name} meta={s.use ?? s.note ?? (s.page ? `${s.page.widthMm} × ${s.page.heightMm} mm` : "")} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState tone="muted" title={starters.length ? "No design matches" : "No designs to start from"} description={starters.length ? "Clear a filter to see more." : "Open the design in use to change it."} />
        )}
      </section>
    </div>
  );
};
