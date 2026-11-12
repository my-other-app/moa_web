"use client";

import { badgeStarter } from "@moa/layout";
import { Button, EmptyState, Skeleton, toast } from "@moa/ui";
import { PencilRulerIcon, RotateCcwIcon } from "lucide-react";
import * as React from "react";

import { DESIGNERS, designSamples } from "../config";
import { defaultIdOf } from "../presets";
import { useLayout, useResetPreset } from "../queries";
import { type Audience, type DesignKind, type DesignScope, type LayerDesign } from "../schemas";
import { ApplyToIssued } from "./apply-to-issued";
import { LayoutThumb, LeaveDialog, type StageLook } from "./dialogs";
import { Gallery } from "./gallery";
import { useTicketFonts } from "./kit";
import { LayerDesignerPage } from "./layer-designer";
import { PresetEditor } from "./preset-editor";
import { AudiencePicker, DesignBar } from "./shell";

/** What the tab shows: the gallery, one ready design's settings, or the canvas (opened on a starter, or on what is saved). */
type View = { mode: "gallery" } | { mode: "preset"; id: string } | { mode: "custom"; starter?: string };

const errorCopy = (err: unknown) => (err instanceof Error && err.message ? err.message : "Something went wrong.");

const THUMB_BOX = { w: 220, h: 150 };
const thumbClass = "bg-sunken grid h-[150px] place-items-center overflow-hidden rounded-[var(--radius-md)]";

/**
 * The gallery with its two canvas cards: the saved canvas drawn small (or a
 * blank one) and, for badges, the CR80 card -- drawn by the stage itself, so
 * the fonts load only here.
 */
const GalleryView = ({
  design,
  kind,
  onPick,
  onCustom,
  onCard,
}: {
  design: LayerDesign;
  kind: DesignKind;
  onPick: (id: string) => void;
  onCustom: () => void;
  onCard?: () => void;
}) => {
  const fontsReady = useTicketFonts();
  const look: StageLook = {
    colors: { primary: design.brand.primary, secondary: design.brand.secondary, ticketType: design.brand.primary },
    values: designSamples(design.sampleValues),
    qrValue: DESIGNERS[kind].sampleQr,
    imageUrl: (l) => (l.source === "org_logo" ? (design.brand.logoUrl ?? null) : l.imageKey ? (design.imageUrls[l.imageKey] ?? null) : null),
    fontsReady,
  };
  const hasCanvas = (design.hasLayout ?? !design.fromStarter) && design.layers.length > 0;
  const inUse = design.active === "custom" ? "custom" : (design.preset?.id ?? defaultIdOf(design) ?? "");
  return (
    <Gallery
      config={DESIGNERS[kind]}
      catalogue={design.catalogue}
      inUse={inUse}
      defaultId={defaultIdOf(design)}
      customThumb={
        hasCanvas ? (
          <LayoutThumb layout={{ canvas: design.canvas, layers: design.layers, page: design.page }} look={look} box={THUMB_BOX} className={thumbClass} />
        ) : (
          <span aria-hidden="true" className={`${thumbClass} text-ink-3`}>
            <PencilRulerIcon className="size-8" />
          </span>
        )
      }
      cardThumb={onCard ? <LayoutThumb layout={badgeStarter("card_cr80")} look={look} box={THUMB_BOX} className={thumbClass} /> : null}
      onPick={onPick}
      onCustom={onCustom}
      onCard={onCard}
    />
  );
};

/**
 * One kind's designs, for the club's templates or one event: who it is for
 * (an event's audiences), then the gallery of ready designs first, then the
 * canvas. The programme has no ready designs and opens on the canvas, as
 * does any kind on a backend that sends no catalogue yet.
 */
export const DesignTab = ({ scope, kind, dirtyRef }: { scope: DesignScope; kind: DesignKind; dirtyRef: React.MutableRefObject<boolean> }) => {
  const config = DESIGNERS[kind];
  const [audience, setAudience] = React.useState<Audience>("event_default");
  const [view, setView] = React.useState<View>({ mode: "gallery" });
  // A switch that would lose unsaved work waits here until the person says so.
  const [pending, setPending] = React.useState<{ audience?: Audience; view?: View } | null>(null);
  const design = useLayout(scope, kind, audience);
  const clearPreset = useResetPreset(scope, kind, audience);

  const apply = (next: { audience?: Audience; view?: View }) => {
    dirtyRef.current = false;
    if (next.audience) setAudience(next.audience);
    if (next.view) setView(next.view);
  };
  const ask = (next: { audience?: Audience; view?: View }) => (dirtyRef.current ? setPending(next) : apply(next));
  const changeAudience = (next: Audience) => next !== audience && ask({ audience: next });
  const picker = scope.kind === "event" ? <AudiencePicker value={audience} onChange={changeAudience} /> : null;
  const leave = (
    <LeaveDialog
      open={pending !== null}
      what={config.noun}
      onStay={() => setPending(null)}
      onLeave={() => {
        if (pending) apply(pending);
        setPending(null);
      }}
    />
  );
  const toGallery = () => ask({ view: { mode: "gallery" } });
  // An event's certificates already issued on another design, and the way to bring them over.
  const issued = kind === "certificate" && scope.kind === "event" ? <ApplyToIssued eventId={scope.eventId} /> : null;

  const d = design.data;
  // The canvas: always for the programme, and for any kind whose backend has no ready designs yet.
  const canvasOnly = !config.gallery || (d !== undefined && d.catalogue.length === 0);
  if (canvasOnly || view.mode === "custom") {
    const inUse = d?.active === "preset" ? (d.catalogue.find((x) => x.id === d.preset?.id)?.name ?? null) : null;
    // A canvas saved here already: it can be put back in use without editing it (DELETE .../preset keeps the layout).
    const canvasSaved = !!d && d.active === "preset" && !!d.hasLayout && d.isOwn;
    const useCanvas = async () => {
      try {
        await clearPreset.mutateAsync();
        toast.success(`The custom ${config.noun} is in use`);
      } catch (err) {
        toast.error(errorCopy(err));
      }
    };
    return (
      <>
        {issued}
        <LayerDesignerPage
          key={view.mode === "custom" ? `custom-${view.starter ?? ""}` : "canvas"}
          scope={scope}
          kind={kind}
          audience={audience}
          picker={picker}
          dirtyRef={dirtyRef}
          onBack={canvasOnly ? undefined : toGallery}
          startWith={view.mode === "custom" ? (view.starter ?? null) : null}
          presetInUse={canvasOnly ? null : inUse}
          onUseCanvas={!canvasOnly && canvasSaved ? useCanvas : undefined}
          usingCanvas={clearPreset.isPending}
        />
        {leave}
      </>
    );
  }

  if (design.isError) {
    return (
      <>
        <DesignBar left={picker} actions={null} />
        <EmptyState
          tone="muted"
          title="Could not load the designs"
          description={errorCopy(design.error)}
          action={
            <Button variant="secondary" onClick={() => void design.refetch()}>
              <RotateCcwIcon /> Try again
            </Button>
          }
        />
        {leave}
      </>
    );
  }
  if (!d) {
    return (
      <>
        <DesignBar left={picker} actions={null} />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[200px] rounded-2xl" />
          ))}
        </div>
      </>
    );
  }

  const open = view.mode === "preset" ? d.catalogue.find((x) => x.id === view.id) : undefined;
  if (open) {
    return (
      <>
        {issued}
        <PresetEditor
          key={`${audience}-${open.id}`}
          scope={scope}
          config={config}
          audience={audience}
          picker={picker}
          design={d}
          info={open}
          dirtyRef={dirtyRef}
          onBack={toGallery}
          onReset={() => apply({ view: { mode: "gallery" } })}
        />
        {leave}
      </>
    );
  }

  return (
    <>
      <DesignBar left={picker} actions={null} />
      {issued}
      <GalleryView
        design={d}
        kind={kind}
        onPick={(id) => apply({ view: { mode: "preset", id } })}
        onCustom={() => apply({ view: { mode: "custom" } })}
        onCard={kind === "badge" ? () => apply({ view: { mode: "custom", starter: "card_cr80" } }) : undefined}
      />
      {leave}
    </>
  );
};
