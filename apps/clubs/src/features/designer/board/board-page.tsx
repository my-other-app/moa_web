"use client";

import { type LayoutV2, POSTER_FORMAT_SPECS } from "@moa/layout";
import { Button, EmptyState, Skeleton, toast } from "@moa/ui";
import { RotateCcwIcon } from "lucide-react";
import * as React from "react";

import { DESIGNERS } from "../config";
import { useApplyPosterStarter, useBoard, useStarterLayout } from "../queries";
import type { Audience, BoardDesign, BoardKind, DesignScope, PosterSlot, StarterMeta } from "../schemas";
import { BackToDesigns, DesignBar } from "../components/shell";
import { PosterStarterDialog } from "../components/poster-starter-dialog";
import { Board } from "./board";
import { boardContext, boardValues, makeRenderer, readLayout } from "./engine";
import { StarterGallery } from "./gallery";

/**
 * One kind's designs on the board: the gallery (the design in use, and the
 * designs to start from), then the board on the one picked. Who it is for
 * (the audience picker) is the tab's; `dirtyRef` tells the tab when leaving
 * would lose work.
 */

const errorCopy = (err: unknown) => (err instanceof Error && err.message ? err.message : "Something went wrong.");

type View = { mode: "gallery" } | { mode: "board"; starter: StarterMeta | null };

const Loading = ({ bar }: { bar: React.ReactNode }) => (
  <>
    {bar}
    <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Skeleton className="h-[min(calc(72vh+53px),853px)] min-h-[433px] rounded-2xl" />
      <div className="flex flex-col gap-3.5">
        <Skeleton className="h-[260px] rounded-2xl" />
        <Skeleton className="h-[360px] rounded-2xl" />
      </div>
    </div>
  </>
);

const Failed = ({ bar, title, err, onRetry }: { bar: React.ReactNode; title: string; err: unknown; onRetry: () => void }) => (
  <>
    {bar}
    <EmptyState
      tone="muted"
      title={title}
      description={errorCopy(err)}
      action={
        <Button variant="secondary" onClick={onRetry}>
          <RotateCcwIcon /> Try again
        </Button>
      }
    />
  </>
);

/** The layout a design opens on, or the error that stops it. */
const opened = (raw: unknown): { layout: LayoutV2 } | { error: unknown } => {
  try {
    return { layout: readLayout(raw) };
  } catch (error) {
    return { error };
  }
};

/** Where the design in use comes from, in a few words, for the gallery card. */
const provenanceOf = (d: BoardDesign, scope: DesignScope) => {
  if (d.kind === "poster") return d.isOwn ? `Saved${d.version > 0 ? ` · version ${d.version}` : ""}` : d.posterFrom === "starter" ? "The built-in poster" : "The next design in line";
  if (d.isOwn) return d.version > 0 ? `Saved · version ${d.version}` : "Saved";
  if (d.fromStarter) return "The default design";
  if (scope.kind === "club") return "Built in";
  return d.audience === "event_default" ? "Your club's template" : "The event's design";
};

export const BoardPage = ({
  scope,
  kind,
  audience,
  picker,
  dirtyRef,
  ask,
  poster,
}: {
  scope: DesignScope;
  kind: BoardKind;
  audience: Audience;
  picker: React.ReactNode;
  dirtyRef: React.MutableRefObject<boolean>;
  /** Run a switch that would lose unsaved work only once the person says so. */
  ask: (go: () => void) => void;
  /** A poster: the variant and format on the board. A new format keeps the board open; a new variant goes back to its gallery. */
  poster?: PosterSlot;
}) => {
  const config = DESIGNERS[kind];
  const [view, setView] = React.useState<View>({ mode: "gallery" });
  const [nonce, setNonce] = React.useState(0);
  const design = useBoard(scope, kind, audience, poster);
  const starterId = view.mode === "board" && view.starter && nonce === 0 ? view.starter.id : null;
  const starter = useStarterLayout(scope, kind, starterId, poster?.format);
  const d = design.data;
  // A poster starter picked in the gallery: use it for every format, or open a copy of this one.
  const [picking, setPicking] = React.useState<StarterMeta | null>(null);
  const apply = useApplyPosterStarter(scope.kind === "event" ? scope.eventId : 0);

  // The audience (or a poster's variant) changed: back to its gallery.
  const who = `${audience}|${poster?.variant ?? ""}`;
  const [seen, setSeen] = React.useState(who);
  if (seen !== who) {
    setSeen(who);
    setView({ mode: "gallery" });
    setNonce(0);
  }

  const toGallery = () =>
    ask(() => {
      dirtyRef.current = false;
      setView({ mode: "gallery" });
      setNonce(0);
    });
  const back = <BackToDesigns onClick={toGallery} />;
  const bar = (left: React.ReactNode) => <DesignBar left={left} actions={null} />;

  const current = React.useMemo(() => (d ? opened(d.layout) : null), [d]);
  const thumbRenderer = React.useMemo(() => {
    if (!d || !current || !("layout" in current)) return null;
    const l = current.layout;
    return makeRenderer({ page: l.page, canvas: l.canvas, vars: l.vars }, boardValues(d, kind), boardContext(d, config.sampleQr, {}, kind === "poster" ? true : undefined), kind);
  }, [d, current, config.sampleQr, kind]);

  if (design.isError) return <Failed bar={bar(picker)} title="Could not load the designs" err={design.error} onRetry={() => void design.refetch()} />;
  if (!d || !current) {
    return view.mode === "gallery" ? (
      <>
        {bar(picker)}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[200px] rounded-2xl" />
          ))}
        </div>
      </>
    ) : (
      <Loading bar={bar(<>{back}{picker}</>)} />
    );
  }

  if (view.mode === "gallery") {
    return (
      <>
        {bar(picker)}
        <StarterGallery
          config={config}
          kind={kind}
          starters={d.starters}
          current={"layout" in current ? current.layout : null}
          renderer={thumbRenderer}
          currentNote={provenanceOf(d, scope)}
          onOpen={() => setView({ mode: "board", starter: null })}
          onPick={(s) => (poster ? setPicking(s) : setView({ mode: "board", starter: s }))}
          design={d}
          eventId={scope.kind === "event" ? scope.eventId : 0}
          format={poster?.format}
        />
        {poster ? (
          <PosterStarterDialog
            starter={picking}
            variantLabel={poster.label}
            format={POSTER_FORMAT_SPECS[poster.format].label}
            busy={apply.isPending}
            onClose={() => setPicking(null)}
            onCopy={() => {
              if (picking) setView({ mode: "board", starter: picking });
              setPicking(null);
            }}
            onApply={async () => {
              if (!picking) return;
              try {
                await apply.mutateAsync({ variant: poster.variant, starterId: picking.id });
                toast.success(`${picking.name} is the poster for ${poster.label}`, { description: "Its square, portrait and story layouts are saved. Change any part of them here." });
                setPicking(null);
                await design.refetch();
                setNonce((n) => n + 1);
                setView({ mode: "board", starter: null });
              } catch (err) {
                toast.error(errorCopy(err));
              }
            }}
          />
        ) : null}
      </>
    );
  }

  const left = (
    <>
      {back}
      {picker}
    </>
  );
  // A starter picked: its copy, until the board is discarded (then what is saved).
  const fromStarter = !!starterId;
  if (fromStarter && starter.isError) return <Failed bar={bar(left)} title="Could not open that design" err={starter.error} onRetry={() => void starter.refetch()} />;
  if (fromStarter && starter.data === undefined) return <Loading bar={bar(left)} />;
  const open = fromStarter ? opened(starter.data) : current;
  if ("error" in open) return <Failed bar={bar(left)} title="Could not open this design" err={open.error} onRetry={() => void design.refetch()} />;
  // A copy of a starter says which one it was copied from.
  const initial = fromStarter && starterId && !open.layout.starter ? { ...open.layout, starter: starterId } : open.layout;

  return (
    <Board
      key={`${audience}-${poster?.variant ?? ""}-${poster?.format ?? ""}-${nonce}`}
      poster={poster}
      config={config}
      kind={kind}
      scope={scope}
      audience={audience}
      design={d}
      initial={initial}
      starterName={fromStarter && view.mode === "board" ? (view.starter?.name ?? null) : null}
      picker={left}
      onGallery={toGallery}
      onSaved={() => void design.refetch()}
      onDiscard={() => {
        dirtyRef.current = false;
        setNonce((n) => n + 1);
      }}
      onReset={async () => {
        await design.refetch();
        setNonce((n) => n + 1);
      }}
      dirtyRef={dirtyRef}
    />
  );
};
