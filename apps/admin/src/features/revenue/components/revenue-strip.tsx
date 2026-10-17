"use client";

import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { formatNumber } from "@moa/app-kit";
import { Skeleton } from "@moa/ui";

import { formatPaiseRounded } from "../format";
import { useRevenue } from "../queries";

/**
 * The overview's line on plan revenue: MRR, paying clubs, collected this
 * month, and the way to the Revenue page. Says nothing when the figures
 * cannot be had, rather than a row of zeros that reads as "nobody pays".
 */
export function RevenueStrip() {
  const { data, isPending, isError } = useRevenue(12);
  if (isError) return null;
  if (isPending || !data) return <Skeleton className="h-[64px] w-full rounded-[var(--radius-card)]" />;

  const figures = [
    ["MRR", formatPaiseRounded(data.mrr_paise)],
    ["Paying clubs", formatNumber(data.counts.paying)],
    ["Collected this month", formatPaiseRounded(data.collected.this_month_paise)],
  ] as const;

  return (
    <Link
      href="/revenue"
      aria-label="Plan revenue: open Revenue"
      className="bg-surface border-line-soft shadow-card hover:border-brand-line flex flex-wrap items-center gap-x-8 gap-y-2 rounded-[var(--radius-card)] border px-5 py-3.5 transition-colors"
    >
      <span className="text-ink-2 text-[12.5px]">Plan revenue</span>
      {figures.map(([label, value]) => (
        <span key={label} className="flex items-baseline gap-2">
          <span className="text-ink text-[20px] tracking-[-0.02em] tabular-nums">{value}</span>
          <span className="text-ink-3 text-[12px]">{label}</span>
        </span>
      ))}
      <span className="text-brand ml-auto flex items-center gap-1 text-[12.5px]">
        Revenue <ArrowRightIcon className="size-3.5" />
      </span>
    </Link>
  );
}
