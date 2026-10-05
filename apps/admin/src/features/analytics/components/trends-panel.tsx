"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency, formatNumber } from "@moa/app-kit";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  cn,
} from "@moa/ui";

import { useAdminTrends } from "../queries";
import { changeOf } from "../delta";
import type { TrendMetric } from "../schemas";

/**
 * Activity over the selected window, with the preceding window for comparison.
 *
 * The window is owned by the page rather than this card, so the chart, the
 * headline figures above it and their deltas all describe the same period --
 * two controls would let them disagree, which is worse than having one.
 */
const METRICS: ReadonlyArray<{
  key: TrendMetric;
  label: string;
  format: (value: number) => string;
}> = [
  { key: "users", label: "New users", format: (v) => formatNumber(v) },
  { key: "registrations", label: "Registrations", format: (v) => formatNumber(v) },
  { key: "events", label: "Events created", format: (v) => formatNumber(v) },
  { key: "revenue", label: "Revenue", format: (v) => formatCurrency(v) },
];

export function TrendsPanel({ days }: { days: number }) {
  const [metric, setMetric] = React.useState<TrendMetric>("registrations");
  const { data, isPending, isError } = useAdminTrends(days);

  const active = METRICS.find((m) => m.key === metric)!;

  return (
    <Card>
      <CardHeader className="gap-4">
        <div>
          <CardTitle className="text-base">Activity</CardTitle>
          <CardDescription>
            Last {days} days, compared with the {days} before.
          </CardDescription>
        </div>

        {/*
         * The four figures double as the chart's series selector. Keeping them
         * as one control means the number you are reading and the line you are
         * looking at cannot drift apart.
         */}
        <div
          role="tablist"
          aria-label="Metric"
          className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
        >
          {METRICS.map((m) => {
            const value = data?.totals[m.key] ?? 0;
            const prior = data?.previous_totals[m.key] ?? 0;
            const delta = data ? changeOf(value, prior) : null;
            const selected = metric === m.key;

            return (
              <button
                key={m.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setMetric(m.key)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  selected
                    ? "border-brand bg-brand/5 ring-brand/20 ring-1"
                    : "hover:bg-accent/40"
                )}
              >
                <p className="text-muted-foreground text-xs">{m.label}</p>
                {isPending ? (
                  <Skeleton className="mt-1.5 h-6 w-16" />
                ) : (
                  <p className="mt-0.5 text-xl font-semibold tabular-nums">
                    {m.format(value)}
                  </p>
                )}
                <p
                  className={cn(
                    "mt-0.5 text-xs",
                    delta === null || delta.direction === "flat"
                      ? "text-muted-foreground"
                      : delta.direction === "up"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-destructive"
                  )}
                >
                  {delta?.label ?? "no change"}
                </p>
              </button>
            );
          })}
        </div>
      </CardHeader>

      <CardContent>
        {isPending ? (
          <Skeleton className="h-[260px] w-full" />
        ) : isError || !data ? (
          <p className="text-muted-foreground py-10 text-center text-sm">
            Could not load trends.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart
              data={data.series}
              margin={{ top: 8, right: 8, bottom: 0, left: -20 }}
            >
              <defs>
                <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border)"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                minTickGap={24}
                tickFormatter={(value: string) =>
                  new Date(value).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                  })
                }
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={56}
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              />
              <Tooltip
                cursor={{ stroke: "var(--border)" }}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  fontSize: 12,
                }}
                labelFormatter={(value) =>
                  new Date(String(value)).toLocaleDateString("en-IN", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })
                }
                formatter={(value) => [active.format(Number(value)), active.label]}
              />
              <Area
                type="monotone"
                dataKey={metric}
                stroke="var(--chart-1)"
                strokeWidth={2}
                fill="url(#trendFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
