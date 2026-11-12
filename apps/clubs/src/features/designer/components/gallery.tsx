"use client";

import { EmptyState, Segmented, StatusBadge, cn } from "@moa/ui";
import * as React from "react";

import type { DesignerConfig } from "../config";
import { type ColourFilter, filterDesigns, isMono, pageLabel, type PhotoFilter, thumbnailOf } from "../presets";
import type { DesignInfo } from "../schemas";

/**
 * The ready designs for one kind, as pictures to pick from, then the ways to
 * make your own: the canvas, and for badges the CR80 card. The one in use
 * says so; the built-in default says so too. Picking opens the design's
 * settings; nothing changes until it is saved there.
 */

/** How wide a card may get before the grid adds a column: a ticket is wide, a badge is tall. */
const MIN_CARD: Record<DesignInfo["kind"], string> = {
  ticket: "grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))]",
  certificate: "grid-cols-[repeat(auto-fill,minmax(min(100%,230px),1fr))]",
  badge: "grid-cols-[repeat(auto-fill,minmax(min(100%,160px),1fr))]",
};

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

const cardClass = (on: boolean) =>
  cn(
    "group bg-surface shadow-card flex w-full flex-col overflow-hidden rounded-[var(--radius-card)] border p-2 text-left transition-colors",
    "hover:border-brand-line focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] focus-visible:outline-none",
    on ? "border-brand-line ring-brand-line ring-1" : "border-line-soft"
  );

/** The design's picture; its name in large type when the picture cannot load. */
const Thumb = ({ d }: { d: DesignInfo }) => {
  const [broken, setBroken] = React.useState(false);
  const ratio = `${d.page.widthPx} / ${d.page.heightPx}`;
  return (
    <span className="bg-sunken relative block overflow-hidden rounded-[var(--radius-md)]" style={{ aspectRatio: ratio }}>
      {broken ? (
        <span className="text-ink-3 absolute inset-0 grid place-items-center p-3 text-center text-[15px] leading-tight font-semibold">{d.name}</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- static WebP thumbnails, already sized; no optimiser needed
        <img
          src={thumbnailOf(d)}
          alt=""
          loading="lazy"
          decoding="async"
          width={d.page.widthPx}
          height={d.page.heightPx}
          onError={() => setBroken(true)}
          className="absolute inset-0 size-full object-cover transition-transform duration-200 group-hover:scale-[1.015]"
        />
      )}
    </span>
  );
};

const Caption = ({ title, meta, chip }: { title: string; meta: string; chip: React.ReactNode }) => (
  <span className="flex items-start justify-between gap-2 px-1 pt-2 pb-0.5">
    <span className="min-w-0">
      <span className="text-ink block truncate text-[13px] font-medium">{title}</span>
      <span className="text-ink-3 block truncate text-[11.5px]">{meta}</span>
    </span>
    {chip}
  </span>
);

const metaOf = (d: DesignInfo) =>
  d.kind === "badge" ? `${d.hasPhoto ? "Photo" : "No photo"} · ${isMono(d) ? "Black and white" : "Colour"}` : pageLabel(d);

export const Gallery = ({
  config,
  catalogue,
  inUse,
  defaultId,
  customThumb,
  cardThumb,
  onPick,
  onCustom,
  onCard,
}: {
  config: DesignerConfig;
  catalogue: DesignInfo[];
  /** What is in use for this audience: a design's id, or "custom" for the canvas. */
  inUse: string | "custom";
  defaultId: string | null;
  /** The canvas card's picture: the saved canvas drawn small, or a blank. */
  customThumb: React.ReactNode;
  /** The CR80 card's picture; badges only. */
  cardThumb?: React.ReactNode;
  onPick: (id: string) => void;
  onCustom: () => void;
  onCard?: () => void;
}) => {
  const [photo, setPhoto] = React.useState<PhotoFilter>("all");
  const [colour, setColour] = React.useState<ColourFilter>("all");
  const isBadge = config.kind === "badge";
  const shown = isBadge ? filterDesigns(catalogue, photo, colour) : catalogue;
  const grid = MIN_CARD[catalogue[0]?.kind ?? "certificate"];
  const chip = (id: string) =>
    inUse === id ? <StatusBadge tone="success" label="In use" className="shrink-0" /> : id === defaultId ? <StatusBadge label="Default" className="shrink-0" /> : null;

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="designs-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 id="designs-title" className="text-ink m-0 text-[15px] font-semibold">
              Ready designs
            </h2>
            <p className="text-ink-3 m-0 mt-0.5 text-[12.5px]">
              {catalogue.length} ready {config.noun} designs. Pick one to set its colour and wording, then save.
            </p>
          </div>
          {isBadge ? (
            <div className="flex flex-wrap items-center gap-2">
              <Segmented label="Photo" value={photo} options={PHOTO} onChange={setPhoto} />
              <Segmented label="Printer" value={colour} options={COLOUR} onChange={setColour} />
            </div>
          ) : null}
        </div>
        {shown.length ? (
          <ul className={cn("m-0 grid list-none gap-3 p-0", grid)}>
            {shown.map((d) => (
              <li key={d.id} className="min-w-0">
                <button type="button" className={cardClass(inUse === d.id)} onClick={() => onPick(d.id)}>
                  <Thumb d={d} />
                  <Caption title={d.name} meta={metaOf(d)} chip={chip(d.id)} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            tone="muted"
            title="No design matches"
            description="Clear a filter to see more."
          />
        )}
      </section>

      <section aria-labelledby="own-title" className="flex flex-col gap-3">
        <div>
          <h2 id="own-title" className="text-ink m-0 text-[15px] font-semibold">
            Make your own
          </h2>
          <p className="text-ink-3 m-0 mt-0.5 text-[12.5px]">Place text, the QR code and pictures on a canvas, or upload a design from Figma.</p>
        </div>
        <ul className={cn("m-0 grid list-none gap-3 p-0", MIN_CARD.certificate)}>
          <li className="min-w-0">
            <button type="button" className={cardClass(inUse === "custom")} onClick={onCustom}>
              {customThumb}
              <Caption title="Custom design" meta="Opens the canvas editor" chip={inUse === "custom" ? <StatusBadge tone="success" label="In use" className="shrink-0" /> : null} />
            </button>
          </li>
          {onCard ? (
            <li className="min-w-0">
              <button type="button" className={cardClass(false)} onClick={onCard}>
                {cardThumb}
                <Caption title="Card (CR80)" meta="54 × 85.6 mm, for card printers" chip={null} />
              </button>
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
};
