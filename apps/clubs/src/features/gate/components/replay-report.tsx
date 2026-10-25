"use client";

import * as React from "react";
import { CheckIcon, TriangleAlertIcon } from "lucide-react";
import { Button, cn } from "@moa/ui";

import type { ReplayReport as Report } from "../lib/replay";
import { DoorBanner, TONE_SOFT } from "./door-kit";

const scans = (n: number) => (n === 1 ? "scan" : "scans");
const time = (iso: string | null) => {
  if (!iso) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};

/**
 * What the server said about the scans saved while the phone had no signal.
 *
 * Every guest behind them was let in at the time, so the ones the server
 * did not admit are listed by name (or ticket, when the code matched no one),
 * each with why, until the volunteer has read them. The admissions are only
 * counted.
 */
export function ReplayReport({ report, onDismiss }: { report: Report; onDismiss: () => void }) {
  const problems = report.problems;
  if (problems.length === 0) {
    return (
      <div role="status" className="text-ink-2 border-line-soft flex items-center gap-2 border-t px-4 py-2 text-[13px]">
        <CheckIcon aria-hidden="true" className="text-admit size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          {report.synced} saved {scans(report.synced)} synced, all checked in.
        </span>
        <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
          OK
        </Button>
      </div>
    );
  }
  return (
    <section aria-label="Saved scans that need a look" className="border-line-soft border-t">
      <DoorBanner
        tone="refuse"
        icon={<TriangleAlertIcon />}
        title={`${problems.length} saved ${scans(problems.length)} ${problems.length === 1 ? "needs" : "need"} a look`}
        className="border-x-0 border-t-0"
        action={
          <Button type="button" size="lg" variant="secondary" onClick={onDismiss}>
            Done
          </Button>
        }
      >
        Checked in: {report.admitted} of {report.synced} synced. These were let in offline, and the server did not admit them:
      </DoorBanner>
      <ul aria-label="Not admitted" className="max-h-[40vh] divide-y overflow-y-auto">
        {problems.map((p) => {
          const at = [p.door, time(p.scannedAt)].filter(Boolean).join(" · ");
          return (
            <li key={p.ref} className="flex items-start gap-3 px-4 py-2.5">
              <span className={cn("mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[11.5px] font-semibold", TONE_SOFT[p.tone])}>{p.tag}</span>
              <div className="min-w-0 flex-1 text-[13.5px] leading-[1.45]">
                <p className="text-ink truncate font-medium">{p.name ?? p.ticket}</p>
                {p.name ? <p className="text-ink-3 truncate font-mono text-[12px]">{p.ticket}</p> : null}
                <p className="text-ink-2">{p.reason}</p>
                {at ? <p className="text-ink-3 text-[12px]">Scanned {at}</p> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
