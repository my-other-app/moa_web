"use client";

import { Button, Notice, Segmented, cn, type NoticeTone } from "@moa/ui";
import { BookOpenIcon, CheckIcon, LayoutTemplateIcon, Loader2Icon, RotateCcwIcon, ScanEyeIcon } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import type { DesignerConfig } from "../config";
import { AUDIENCES, type Audience, type DesignScope } from "../schemas";

/**
 * The chrome around the stage: who the design is for, where it comes from,
 * the actions on the whole design, and whether it is saved. The stage and
 * the panels sit between these; nothing here draws the design.
 */

/** Which audience is being designed: everyone, or one group's own variant. */
export const AudiencePicker = ({ value, onChange }: { value: Audience; onChange: (v: Audience) => void }) => (
  <div className="flex flex-wrap items-center gap-2.5">
    <span className="eyebrow">Designing for</span>
    <Segmented label="Designing for" value={value} options={AUDIENCES} onChange={onChange} />
  </div>
);

/** The actions on the whole design, above the stage. */
export const DesignActions = ({
  onGuide,
  onLayouts,
  onPreview,
  disabled,
}: {
  onGuide?: () => void;
  onLayouts?: () => void;
  onPreview?: () => void;
  disabled?: boolean;
}) => (
  <div className="ml-auto flex flex-wrap items-center gap-2">
    <Button variant="ghost" disabled={disabled} onClick={onGuide}>
      <BookOpenIcon /> Designing in Figma?
    </Button>
    <Button variant="secondary" disabled={disabled} onClick={onLayouts}>
      <LayoutTemplateIcon /> Layouts
    </Button>
    <Button variant="secondary" disabled={disabled} onClick={onPreview}>
      <ScanEyeIcon /> Preview as issued
    </Button>
  </div>
);

/** The row above the stage: the audience on the left (an event's only), the design's actions on the right. */
export const DesignBar = ({ left, actions }: { left?: React.ReactNode; actions: React.ReactNode }) => (
  <div className="flex flex-wrap items-center gap-3">
    {left}
    {actions}
  </div>
);

/**
 * Where the open design comes from, said once above the stage: a starter, the
 * club's template, the event's own, or one group's copy. A variant is a full
 * snapshot cloned from the event's design, not a diff, and this makes that
 * legible before the first save forks it.
 */
export const Provenance = ({
  scope,
  audience,
  scopeName,
  config,
  isOwn,
  fromStarter,
  version,
  dirty,
  onReset,
  onLayouts,
}: {
  scope: DesignScope;
  audience: Audience;
  scopeName: string;
  config: DesignerConfig;
  isOwn: boolean;
  fromStarter: boolean;
  version: number;
  dirty: boolean;
  onReset: () => void;
  onLayouts: () => void;
}) => {
  const noun = config.noun;
  const starter = config.starters.classic?.label ?? "classic";
  const v = version > 0 ? ` · version ${version}` : "";
  const reset = (label: string) => (
    <Button size="sm" variant="secondary" onClick={onReset}>
      <RotateCcwIcon /> {label}
    </Button>
  );
  const layouts = (
    <Button size="sm" variant="secondary" onClick={onLayouts}>
      <LayoutTemplateIcon /> Choose a layout
    </Button>
  );
  let tone: NoticeTone = "neutral";
  let tag: string;
  let body: React.ReactNode;
  let action: React.ReactNode = null;

  if (scope.kind === "club") {
    if (fromStarter) {
      tone = "accent";
      tag = "Starter";
      body = `Your club has no ${noun} template yet, so this is the ${starter} layout. Save it to make it the template every new event starts from.`;
      action = layouts;
    } else if (isOwn) {
      tag = "Club template";
      body = `Your club's ${noun} template${v}. Every new event starts from it; an event that saved its own keeps it, so editing here never reaches back into what was already sent.`;
      action = reset("Back to the built-in layout");
    } else {
      tag = "Built in";
      body = `The built-in ${noun}. Save it to make it your club's template.`;
    }
  } else if (audience === "event_default") {
    if (fromStarter) {
      tone = "accent";
      tag = "Starter";
      body = `Nothing is designed for this event or in your club's templates yet, so this is the ${starter} layout. Change it as you like and save; saving makes a copy for this event only.`;
      action = layouts;
    } else if (isOwn) {
      tag = "This event";
      body = `This event's own ${noun}${v}. Edits to your club's template no longer reach it.`;
      action = reset("Use the club template");
    } else {
      tag = "Club template";
      body = `This event uses your club's ${noun} template. Saving here makes a copy for this event only; the template stays as it is.`;
      action = (
        <Button asChild size="sm" variant="secondary">
          <Link href={`/templates?kind=${config.kind}`}>Edit the template</Link>
        </Button>
      );
    }
  } else if (isOwn) {
    tone = "caution";
    tag = "Own copy";
    body = `${scopeName} have their own ${noun}: a complete copy, made when it was first customised. Later edits to the event's design do not reach it.`;
    action = reset("Reset to the event's design");
  } else {
    tone = "caution";
    tag = "Follows event";
    body = dirty
      ? `Saving now makes a complete copy of the design for ${scopeName.toLowerCase()} — from then on the event's design no longer flows through.`
      : `${scopeName} get the event's design. Moving anything here and saving makes a complete copy for them — from then on the event's design no longer flows through.`;
  }

  return (
    <Notice tone={tone} tag={tag} action={action}>
      {body}
    </Notice>
  );
};

export type SaveState = "saving" | "error" | "dirty" | "starter" | "saved" | "clean";

const DOT: Record<SaveState, string> = {
  saving: "bg-brand animate-pulse",
  error: "bg-refuse",
  dirty: "bg-caution",
  starter: "bg-caution",
  saved: "bg-admit",
  clean: "bg-ink-3",
};

const TITLE: Record<SaveState, string> = {
  saving: "Saving…",
  error: "Not saved",
  dirty: "Unsaved changes",
  starter: "Not saved yet",
  saved: "Saved",
  clean: "No changes",
};

/**
 * Whether the design is saved, always in view: the bar keeps to the bottom of
 * the page while the stage and the panels scroll above it, and carries the one
 * action the page is for.
 */
export const SaveBar = ({ state, detail, onDiscard, onSave }: { state: SaveState; detail: string; onDiscard: () => void; onSave: () => void }) => {
  const done = state === "saved" || state === "clean";
  return (
    <div
      role="region"
      aria-label="Save"
      className="bg-surface/90 border-line-soft shadow-floating sticky bottom-0 z-20 flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border px-4 py-3 backdrop-blur-sm"
    >
      <span className={cn("size-2 shrink-0 rounded-full", DOT[state])} aria-hidden="true" />
      <p role="status" aria-live="polite" className="m-0 min-w-0 flex-1 text-[13px] leading-[1.45]">
        <span className={cn("font-medium", state === "error" ? "text-refuse" : "text-ink")}>{TITLE[state]}</span>
        {detail ? <span className="text-ink-3"> · {detail}</span> : null}
      </p>
      {state === "dirty" || state === "error" ? (
        <Button variant="ghost" onClick={onDiscard}>
          Discard
        </Button>
      ) : null}
      <Button disabled={state === "saving" || done} onClick={onSave}>
        {state === "saving" ? <Loader2Icon className="animate-spin" /> : done ? <CheckIcon /> : null}
        {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Save design"}
      </Button>
    </div>
  );
};

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="border-line bg-sunken text-ink-2 rounded-[6px] border px-1.5 py-0.5 font-mono text-[10.5px]">{children}</kbd>
);

/** The keys the stage answers to, as a footnote under the panels. */
export const Shortcuts = () => (
  <p className="text-ink-3 m-0 px-1 text-[11.5px] leading-[1.9]">
    <Kbd>↑↓←→</Kbd> nudge · <Kbd>⇧</Kbd> ×10 · <Kbd>⌫</Kbd> delete · <Kbd>⌘D</Kbd> duplicate · <Kbd>⌘Z</Kbd> undo · hold <Kbd>⌥</Kbd> to drag without
    snapping
  </p>
);
