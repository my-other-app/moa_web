"use client";

import * as React from "react";
import Link from "next/link";
import { formatNumber, pct } from "@moa/app-kit";

import { useNetworkingSummary } from "../queries";
import { Panel, PanelTitle, RuleRow } from "./v2-primitives";

/**
 * Profiles and networking across the platform, in one panel on the
 * overview: how many profiles are complete, the personal QR codes in use,
 * the saves this week and this month, how many of them are mutual, and
 * the profile reports still open (to the queue, filtered). Off the page
 * while it loads and whenever the API cannot answer, so the overview never
 * depends on it.
 */
export function NetworkingSummaryPanel({ className }: { className?: string }) {
  const q = useNetworkingSummary();
  const d = q.data;
  if (q.isError || !d) return null;
  const rows: Array<[string, React.ReactNode]> = [
    [
      "Profiles completed",
      d.profiles_total ? `${formatNumber(d.profiles_completed)} of ${formatNumber(d.profiles_total)} · ${pct(d.profiles_completed, d.profiles_total)}%` : formatNumber(d.profiles_completed),
    ],
    ["Personal QR codes in use", formatNumber(d.codes_active)],
    ["Saves, last 7 days", formatNumber(d.saves_7d)],
    ["Saves, last 30 days", formatNumber(d.saves_30d)],
    ["Mutual saves", d.mutual_rate === null ? "—" : `${Math.round(d.mutual_rate * 10) / 10}%`],
    [
      "Open profile reports",
      d.reports_open ? (
        <Link href="/reports?type=profile" className="text-brand hover:underline">
          {formatNumber(d.reports_open)}
        </Link>
      ) : (
        "0"
      ),
    ],
  ];
  return (
    <Panel className={className} role="region" aria-label="Networking">
      <PanelTitle aside="profiles and saves">Networking</PanelTitle>
      {rows.map(([label, value]) => (
        <RuleRow key={label} className="flex items-baseline justify-between gap-2.5">
          <span className="text-ink-2 min-w-0 truncate text-[13px]">{label}</span>
          <span className="shrink-0 text-[15px] tabular-nums">{value}</span>
        </RuleRow>
      ))}
    </Panel>
  );
}
