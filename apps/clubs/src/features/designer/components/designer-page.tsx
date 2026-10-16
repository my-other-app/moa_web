"use client";

import { Button, TabRail } from "@moa/ui";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as React from "react";

import { useEventDetail } from "@/features/events";

import { DESIGNERS } from "../config";
import { DESIGN_KINDS, type DesignKind, type DesignScope } from "../schemas";
import { LeaveDialog } from "./dialogs";
import { LayerDesignerPage } from "./layer-designer";

const isKind = (v: string | null): v is DesignKind => !!v && (DESIGN_KINDS as readonly string[]).includes(v);

/**
 * One page for every design, for the club's templates and for one event's
 * own: what is being designed (a tab per kind), for whom (everyone, or one
 * group), where it comes from, and the editor. `?kind=` opens on one.
 */
export function DesignerPage({ scope }: { scope: DesignScope }) {
  return (
    <React.Suspense fallback={null}>
      <Designers scope={scope} />
    </React.Suspense>
  );
}

function Designers({ scope }: { scope: DesignScope }) {
  const params = useSearchParams();
  const [kind, setKind] = React.useState<DesignKind>(() => {
    const asked = params.get("kind");
    return isKind(asked) ? asked : "ticket";
  });
  const [pending, setPending] = React.useState<DesignKind | null>(null);
  // The open editor keeps this current; a switch away from unsaved work asks first.
  const dirtyRef = React.useRef(false);
  // The club's designer has no event: the hook stays quiet for 0.
  const eventId = scope.kind === "event" ? scope.eventId : 0;
  const event = useEventDetail(eventId);
  const config = DESIGNERS[kind];

  const go = (next: DesignKind) => {
    dirtyRef.current = false;
    setKind(next);
    // The kind is in the address, so a reload or a shared link opens on it.
    const q = new URLSearchParams(window.location.search);
    q.set("kind", next);
    window.history.replaceState(null, "", `?${q.toString()}`);
  };
  const choose = (next: string) => {
    if (!isKind(next) || next === kind) return;
    if (dirtyRef.current) setPending(next);
    else go(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title">{scope.kind === "event" ? "Designs" : "Templates"}</h1>
          <p className="text-ink-3 mt-1 max-w-[72ch] text-[12.5px] leading-[1.5]">
            {/* Whose design this is, first: the event's own, or the club's defaults every event starts from. */}
            {scope.kind === "club" ? (
              <span className="text-ink-2 font-medium">Your club&apos;s defaults · </span>
            ) : event.data?.name ? (
              <span className="text-ink-2 font-medium">{event.data.name} · </span>
            ) : null}
            {config.description}
          </p>
        </div>
        {scope.kind === "event" ? (
          <Button asChild variant="secondary">
            <Link href={`/events/${scope.eventId}`}>
              <ArrowLeftIcon /> Back to event
            </Link>
          </Button>
        ) : null}
      </header>

      <TabRail
        label={scope.kind === "event" ? "What to design" : "Which template"}
        value={kind}
        onChange={choose}
        items={DESIGN_KINDS.map((k) => ({ key: k, label: DESIGNERS[k].label }))}
      />

      <LayerDesignerPage key={kind} scope={scope} kind={kind} dirtyRef={dirtyRef} />

      <LeaveDialog
        open={pending !== null}
        what={config.noun}
        onStay={() => setPending(null)}
        onLeave={() => {
          if (pending) go(pending);
          setPending(null);
        }}
      />
    </div>
  );
}
