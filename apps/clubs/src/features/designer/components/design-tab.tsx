"use client";

import * as React from "react";

import { BoardPage } from "../board/board-page";
import { DESIGNERS } from "../config";
import { type Audience, type DesignKind, type DesignScope, isBoardKind } from "../schemas";
import { ApplyToIssued } from "./apply-to-issued";
import { LeaveDialog } from "./dialogs";
import { LayerDesignerPage } from "./layer-designer";
import { AudiencePicker } from "./shell";

/**
 * One kind's designs, for the club's templates or one event: who it is for
 * (an event's audiences), then the designs. Tickets, ID cards and
 * certificates are on the board (layout v2: the gallery, then every part
 * editable); the programme keeps its canvas editor.
 */
export const DesignTab = ({ scope, kind, dirtyRef }: { scope: DesignScope; kind: DesignKind; dirtyRef: React.MutableRefObject<boolean> }) => {
  const config = DESIGNERS[kind];
  const [audience, setAudience] = React.useState<Audience>("event_default");
  // A switch that would lose unsaved work waits here until the person says so.
  const [pending, setPending] = React.useState<(() => void) | null>(null);

  const ask = React.useCallback(
    (go: () => void) => {
      if (dirtyRef.current) setPending(() => go);
      else go();
    },
    [dirtyRef]
  );
  const changeAudience = (next: Audience) =>
    next !== audience &&
    ask(() => {
      dirtyRef.current = false;
      setAudience(next);
    });
  const picker = scope.kind === "event" ? <AudiencePicker value={audience} onChange={changeAudience} /> : null;
  // An event's certificates already issued on another design, and the way to bring them over.
  const issued = kind === "certificate" && scope.kind === "event" ? <ApplyToIssued eventId={scope.eventId} /> : null;
  const leave = (
    <LeaveDialog
      open={pending !== null}
      what={config.noun}
      onStay={() => setPending(null)}
      onLeave={() => {
        pending?.();
        setPending(null);
      }}
    />
  );

  return (
    <>
      {issued}
      {isBoardKind(kind) ? (
        <BoardPage scope={scope} kind={kind} audience={audience} picker={picker} dirtyRef={dirtyRef} ask={ask} />
      ) : (
        <LayerDesignerPage key={`canvas-${audience}`} scope={scope} kind={kind} audience={audience} picker={picker} dirtyRef={dirtyRef} />
      )}
      {leave}
    </>
  );
};
