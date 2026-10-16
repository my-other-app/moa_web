"use client";

import * as React from "react";
import { DoorOpenIcon, MonitorSmartphoneIcon, NotebookPenIcon } from "lucide-react";

import type { DoorKind } from "../schemas";

/**
 * The few pieces both door pages are drawn with: the tab's own heading,
 * the mark a door kind carries, and the words for a guest's role.
 */
export function TabHead({
  title,
  line,
  actions,
}: {
  title: string;
  line: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-ink m-0 text-[17px] font-semibold tracking-[-0.02em]">
          {title}
        </h2>
        <p className="text-ink-3 mt-1 text-[12.5px]">{line}</p>
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export const KIND_ICON: Record<DoorKind, React.ReactNode> = {
  door: <DoorOpenIcon className="size-[18px]" />,
  desk: <NotebookPenIcon className="size-[18px]" />,
  kiosk: <MonitorSmartphoneIcon className="size-[18px]" />,
};

export const ROLE: Record<string, string> = {
  attendee: "Attendee",
  speaker: "Speaker",
  staff: "Staff",
};

/** A figure under a chart: an eyebrow, the value, a line of context. */
export function Figure({
  k,
  v,
  sub,
}: {
  k: string;
  v: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="eyebrow">{k}</div>
      <div className="text-ink mt-1 font-mono text-[15px] tabular-nums">{v}</div>
      {sub ? <div className="text-ink-3 text-[11.5px]">{sub}</div> : null}
    </div>
  );
}
