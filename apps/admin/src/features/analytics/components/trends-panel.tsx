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
import { TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import { formatCurrency, formatNumber } from "@moa/app-kit";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  cn,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { useAdminTrends } from "../queries";
import type { TrendMetric } from "../schemas";

/**
 * Trends over a window, with the preceding window for comparison.
 *
 * The dashboard's figures were all counters -- "731 registrations" with no
 * indication of whether that is rising or falling. This is the panel that
 * answers the second question.
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

const WINDOWS = [7, 30, 90] as const;

/**
 * Percentage change against the previous window.
 *
 * Growth from zero is not "infinite percent" -- it is reported as new rather
 * than as a number nobody can act on.
 */
function change(current: number, previous: number): { text: string; up: boolean } | null {
  if (previous === 0) return current > 0 ? { text: "new", up: true } : null;
  const delta = ((current - previous) / previous) * 100;
  if (Math.abs(delta) < 1) return { text: "flat", up: delta >= 0 };
  return { text: `${delta > 0 ? "+" : ""}${Math.round(delta)}%`, up: delta > 0 };
}

export function TrendsPanel() {
  const [days, setDays] = React.useState<number>(30);
  const [metric, setMetric] = React.useState<TrendMetric>("registrations");
  const { data, isPending, isError } = useAdminTrends(days);

  const active = METRICS.find((m) => m.key === metric)!;
  const current = data?.totals[metric] ?? 0;
  const previous = data?.previous_totals[metric] ?? 0;
  const delta = data ? change(current, previous) : null;

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Trends</CardTitle>
            <CardDescription>
              Compared with the previous {days} days.
            </CardDescription>
          </div>
          <div className="flex gap-1">
            {WINDOWS.map((window) => (
              <Button
                key={window}
                size="sm"
                variant={days === window ? "default" : "ghost"}
                className={pressable}
                onClick={() => setDays(window)}
              >
                {window}d
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-4">
          {METRICS.map((m) => {
            const value = data?.totals[m.key] ?? 0;
            const prior = data?.previous_totals[m.key] ?? 0;
            const d = data ? change(value, prior) : null;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setMetric(m.key)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  metric === m.key ? "border-primary bg-accent/50" : "hover:bg-accent/30"
                )}
              >
                <p className="text-muted-foreground text-xs">{m.label}</p>
                {isPending ? (
                  <Skeleton className="mt-1 h-6 w-16" />
                ) : (
                  <p className="mt-0.5 text-xl font-semibold tabular-nums">
                    {m.format(value)}
                  </p>
                )}
                {d ? (
                  <p
                    className={cn(
                      "mt-0.5 flex items-center gap-1 text-xs",
                      d.up ? "text-emerald-600" : "text-destructive"
                    )}
                  >
                    {d.up ? (
                      <TrendingUpIcon className="size-3" />
                    ) : (
                      <TrendingDownIcon className="size-3" />
                    )}
                    {d.text}
                  </p>
                ) : (
                  <p className="text-muted-foreground mt-0.5 text-xs">no change</p>
                )}
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
