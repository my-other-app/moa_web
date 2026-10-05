"use client";

import Link from "next/link";
import { ArrowUpRightIcon } from "lucide-react";
import { formatCurrency, formatNumber } from "@moa/app-kit";
import { RadialGauge, Skeleton, cn, toPercent } from "@moa/ui";
import { hoverLift } from "@moa/ui/motion";

import { useDashboardSignals } from "../queries";

/**
 * Money taken, against money kept.
 *
 * The payments page reports gross and net side by side as two figures, which
 * makes a rising refund rate easy to miss. Here the dial *is* the ratio, so the
 * arc shrinking is the signal -- and failed payments sit in the same card
 * because they are the other way revenue goes missing.
 */
function Legend({
  label,
  value,
  dotClass,
}: {
  label: string;
  value: string;
  dotClass: string;
}) {
  return (
    <div className="rounded-lg bg-white/10 px-3 py-2">
      <div className="flex items-center gap-1.5">
        <span className={cn("size-1.5 rounded-full", dotClass)} aria-hidden="true" />
        <span className="text-xs opacity-80">{label}</span>
      </div>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function RevenuePanel() {
  const { data, isPending, isError } = useDashboardSignals();

  if (isPending) {
    return <Skeleton className="h-[16rem] w-full rounded-xl" />;
  }

  if (isError || !data) {
    return (
      <div className="text-muted-foreground rounded-xl border border-dashed p-6 text-sm">
        Could not load payment totals.
      </div>
    );
  }

  const { captured, refunded, net, failed } = data.money;
  const kept = toPercent(net, captured);

  return (
    <div
      className={cn(
        "bg-primary text-primary-foreground rounded-xl p-5",
        hoverLift
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Revenue retained</h3>
          <p className="text-xs opacity-70">Captured, less refunds</p>
        </div>
        <Link
          href="/payments"
          aria-label="View all payments"
          className="flex size-6 items-center justify-center rounded-md bg-white/10 transition-colors hover:bg-white/20"
        >
          <ArrowUpRightIcon className="size-3.5" />
        </Link>
      </div>

      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-center xl:flex-col">
        <RadialGauge
          percent={kept}
          label="Share of captured revenue retained"
          value={`${Math.round(kept)}%`}
          caption={formatCurrency(net)}
          size={132}
          thickness={9}
          arcClassName="text-white"
          trackClassName="text-white"
          className="shrink-0"
        />

        <div className="grid w-full flex-1 grid-cols-2 gap-2 xl:grid-cols-2">
          <Legend
            label="Captured"
            value={formatCurrency(captured)}
            dotClass="bg-white"
          />
          <Legend
            label="Refunded"
            value={formatCurrency(refunded)}
            dotClass="bg-amber-300"
          />
          <Legend
            label="Failed"
            value={formatNumber(failed)}
            dotClass="bg-red-400"
          />
          <Legend label="Net" value={formatCurrency(net)} dotClass="bg-emerald-300" />
        </div>
      </div>
    </div>
  );
}
