"use client";

import * as React from "react";
import { SectionTitle, formatCurrency, formatNumber } from "@moa/app-kit";
import { EmptyState, Input, Label, Skeleton, StatCard, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@moa/ui";

import { ExcelExportButton } from "@/components/excel-export-button";

import { reportsExportUrl } from "../api";
import { useTeamworkReports } from "../queries";
import { hoursLabel, words } from "../schemas";

const STAGES = ["new", "contacted", "meeting", "proposal", "negotiation", "won", "lost"] as const;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** The name a breakdown row goes by, whatever the server calls it. */
function rowName(row: Record<string, unknown>): string {
  for (const k of ["name", "label", "topic", "person", "reason"]) {
    const v = row[k];
    if (typeof v === "string" && v) return v;
  }
  return "—";
}

const NAME_KEYS = new Set(["id", "user_id", "name", "label", "topic", "person", "reason", "key"]);

/** A breakdown (by person, by topic): its name, then every figure the server counts, hours read as hours. */
function Breakdown({ rows, first, empty }: { rows: Record<string, unknown>[]; first: string; empty: string }) {
  if (rows.length === 0) return <p className="text-ink-3 m-0 text-sm">{empty}</p>;
  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r).filter((k) => !NAME_KEYS.has(k) && typeof r[k] === "number"))));
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{first}</TableHead>
          {keys.map((k) => (
            <TableHead key={k} className="text-right">
              {words(k.replace(/_h$/, "").replace(/_median$/, " (median)"))}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={`${rowName(r)}-${i}`}>
            <TableCell>{rowName(r)}</TableCell>
            {keys.map((k) => {
              const v = r[k];
              return (
                <TableCell key={k} className="text-right tabular-nums">
                  {typeof v !== "number" ? "—" : k.endsWith("_h") ? hoursLabel(v) : formatNumber(v)}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * Reports: reply and resolution times, load per person and per topic, the
 * survey; the pipeline by type and stage, won and lost by reason, value by
 * stage. The period is the admin's; the workbook carries the same figures.
 */
export function TeamworkReportsPage() {
  const [from, setFrom] = React.useState(() => isoDay(new Date(Date.now() - 30 * 86_400_000)));
  const [to, setTo] = React.useState(() => isoDay(new Date()));
  const range = { from, to };
  const { data, isPending, isError } = useTeamworkReports(range);

  const reasons: Record<string, unknown>[] = data
    ? Array.isArray(data.leads.won_lost.by_reason)
      ? data.leads.won_lost.by_reason
      : Object.entries(data.leads.won_lost.by_reason).map(([reason, count]) => ({ reason, count }))
    : [];
  const types = data ? Object.keys(data.leads.pipeline) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="report-from">From</Label>
          <Input id="report-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-[170px]" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="report-to">To</Label>
          <Input id="report-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="w-[170px]" />
        </div>
        <div className="flex-1" />
        <ExcelExportButton href={reportsExportUrl(range)} stem={`teamwork-reports-${from}-${to}`} />
      </div>

      {isPending ? <Skeleton className="h-96 w-full" /> : null}
      {isError ? <EmptyState tone="muted" title="The reports could not be read" description="Try another period, or again in a moment." /> : null}
      {data ? (
        <>
          <section className="flex flex-col gap-3">
            <SectionTitle>Support</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="First reply (median)" value={hoursLabel(data.support.first_reply_median_h)} />
              <StatCard label="Resolution (median)" value={hoursLabel(data.support.resolution_median_h)} />
              <StatCard label="Solved, they said" value={formatNumber(data.support.survey.yes)} />
              <StatCard label="Not solved, they said" value={formatNumber(data.support.survey.no)} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="flex flex-col gap-2">
                <h3 className="m-0 text-sm font-semibold">By person</h3>
                <Breakdown rows={data.support.by_person} first="Person" empty="No cases in this period." />
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="m-0 text-sm font-semibold">By topic</h3>
                <Breakdown rows={data.support.by_topic} first="Topic" empty="No cases in this period." />
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <SectionTitle>Leads</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Won" value={formatNumber(data.leads.won_lost.won)} />
              <StatCard label="Lost" value={formatNumber(data.leads.won_lost.lost)} />
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="m-0 text-sm font-semibold">Pipeline by type and stage</h3>
              {types.length === 0 ? (
                <p className="text-ink-3 m-0 text-sm">No leads yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      {STAGES.map((s) => (
                        <TableHead key={s} className="text-right">
                          {words(s)}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {types.map((t) => (
                      <TableRow key={t}>
                        <TableCell>{words(t)}</TableCell>
                        {STAGES.map((s) => (
                          <TableCell key={s} className="text-right tabular-nums">
                            {formatNumber(data.leads.pipeline[t]?.[s] ?? 0)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell className="text-ink-3">Value (₹)</TableCell>
                      {STAGES.map((s) => (
                        <TableCell key={s} className="text-ink-3 text-right tabular-nums">
                          {data.leads.value_by_stage[s] ? formatCurrency(data.leads.value_by_stage[s]) : "—"}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="m-0 text-sm font-semibold">Lost, by reason</h3>
              <Breakdown rows={reasons} first="Reason" empty="No leads lost in this period." />
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
