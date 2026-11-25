"use client";

import * as React from "react";
import { MaximizeIcon, MinimizeIcon } from "lucide-react";

import { useEventDetail } from "@/features/events/queries";

import { isDefaultControl, type Screen } from "../schemas";
import { logoFooterOf } from "../stage/room";
import { Stage } from "../stage/stage";

/**
 * Whether a projector page draws the themed stage rather than its own look.
 *
 * An event that never saved a theme, whose screen controls are as they
 * always were and whose round plays by today's rules, is drawn exactly as
 * it always has been (screen-page, present-page). Anything else needs the
 * stage: the theme itself; a layout the host picked (the Q&A wall, idle
 * slides, the ticker, question-only results); teams, whose board only the
 * stage draws; or a host-revealed round, whose "answers are in" pause only
 * the stage says; or the logo strip along the foot, which only the stage
 * fits around what it shows.
 */
export function usesStage(s: Screen): boolean {
  if (s.theme_custom) return true;
  if (logoFooterOf(s)) return true;
  if (!isDefaultControl(s.control)) return true;
  const st = s.quiz?.settings;
  return Boolean(st && (st.teams.mode !== "off" || st.flow.reveal === "host"));
}

/** The screen is cast from a laptop; this is the one control on it. */
export function FullScreenButton() {
  const [full, setFull] = React.useState(false);
  React.useEffect(() => {
    const sync = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };
  return (
    <button
      type="button"
      onClick={toggle}
      // Out of the way on the projector; back on a keypress or a nudge of the mouse.
      className="btn btn-secondary btn-sm fixed top-5 right-5 z-10 opacity-0 transition-opacity focus-visible:opacity-100 hover:opacity-100"
    >
      {full ? <MinimizeIcon className="size-3.5" /> : <MaximizeIcon className="size-3.5" />}
      {full ? "Leave full screen" : "Full screen"}
    </button>
  );
}

/** A projector page drawn by the stage, full window. */
export function StagePage({ eventId, screen, variant }: { eventId: number; screen: Screen; variant: "screen" | "present" }) {
  // The join QR needs the slug, which lives on the event's detail; until it
  // arrives the legacy /{id}/live address resolves to the same room.
  const detail = useEventDetail(eventId);
  return (
    <main className="h-dvh w-full overflow-hidden">
      {variant === "present" ? <FullScreenButton /> : null}
      <Stage screen={screen} event={{ id: eventId, slug: detail.data?.slug }} variant={variant} />
    </main>
  );
}
