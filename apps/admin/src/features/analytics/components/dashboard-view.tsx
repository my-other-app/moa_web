"use client";

import * as React from "react";
import { PageHeader } from "@moa/app-kit";
import { Button, cn } from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { AttentionPanel } from "./attention-panel";
import { CompositionPanel } from "./composition-panel";
import { MetricRail } from "./metric-rail";
import { RevenuePanel } from "./revenue-panel";
import { TrendsPanel } from "./trends-panel";

/**
 * The overview, as one screen.
 *
 * It used to be three stacked blocks -- counters, a chart, a queue -- which
 * meant the operational state (how much is unapproved, where revenue is going)
 * was below the fold or on another page entirely. The layout now puts the
 * figures and what needs doing in the main column, and the standing state of
 * the platform in a rail beside them, so the whole picture is one view.
 *
 * The period lives here because four separate panels read from it; owning it
 * at the top is what keeps them describing the same window.
 */
const WINDOWS = [7, 30, 90] as const;

export function DashboardView() {
  const [days, setDays] = React.useState<number>(30);

  return (
    <>
      <PageHeader
        title="Overview"
        description="Platform activity, and anything waiting on a decision."
        action={
          <div
            role="group"
            aria-label="Reporting period"
            className="bg-muted flex gap-1 rounded-lg p-1"
          >
            {WINDOWS.map((window) => (
              <Button
                key={window}
                size="sm"
                variant={days === window ? "default" : "ghost"}
                aria-pressed={days === window}
                className={cn("px-3", pressable)}
                onClick={() => setDays(window)}
              >
                {window}d
              </Button>
            ))}
          </div>
        }
      />

      <div className="space-y-6">
        <MetricRail days={days} />

        <div className="grid items-start gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <TrendsPanel days={days} />
            <AttentionPanel />
          </div>

          <div className="space-y-6">
            <CompositionPanel />
            <RevenuePanel />
          </div>
        </div>
      </div>
    </>
  );
}
