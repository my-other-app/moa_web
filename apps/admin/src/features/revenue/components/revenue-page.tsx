"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarClockIcon,
  GiftIcon,
  HourglassIcon,
  IndianRupeeIcon,
  Loader2Icon,
  RefreshCwIcon,
  SparklesIcon,
  TicketIcon,
  TrendingUpIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";
import { formatNumber } from "@moa/app-kit";
import { InlineAlert, Segmented, Skeleton, cn } from "@moa/ui";

import { useCan } from "@/hooks/use-can";

import { formatPaise, formatPaiseRounded, monthChange, monthLabel } from "../format";
import { useBackfill, useRevenue } from "../queries";
import type { Revenue } from "../schemas";
import { ChargesPanel } from "./charges-panel";
import { CollectedChart, CollectedLegend } from "./collected-chart";

/**
 * Revenue: what clubs pay MyOtherApp for their plans.
 *
 * Free plans an admin gave are counted beside the paying ones, at ₹0 and
 * never as money. Ticket sales taken through MyOtherApp's own Razorpay
 * account are the clubs' money held for them, so they sit in a box of their
 * own, labelled as such, and are never added to anything here.
 */
const WINDOWS = [
  { value: "6", label: "6 months" },
  { value: "12", label: "12 months" },
  { value: "24", label: "24 months" },
] as const;

function Panel({ className, children, ...props }: React.ComponentProps<"section">) {
  return (
    <section className={cn("bg-surface border-line-soft shadow-card flex min-w-0 flex-col gap-3 rounded-[var(--radius-card)] border p-[18px]", className)} {...props}>
      {children}
    </section>
  );
}

function PanelTitle({ id, children, aside }: { id?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 id={id} className="text-ink m-0 text-[14.5px] font-semibold tracking-[-0.01em]">
        {children}
      </h3>
      {aside ? <span className="text-ink-3 text-[11.5px]">{aside}</span> : null}
    </div>
  );
}

function Tile({ label, value, note, icon, accent, chip }: { label: string; value: string; note: React.ReactNode; icon: React.ReactNode; accent?: boolean; chip?: React.ReactNode }) {
  return (
    // A labelled group, so "₹25,000" is never read out without what it is.
    <div role="group" aria-label={label} className="bg-surface shadow-card flex flex-col gap-1 rounded-[var(--radius-card)] px-5 py-[18px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-ink text-[13.5px]">{label}</span>
        <span className="bg-brand-soft text-brand grid size-[30px] shrink-0 place-items-center rounded-[9px]">{icon}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("text-[24px] tracking-[-0.02em] tabular-nums", accent && "text-brand")}>{value}</span>
        {chip}
      </div>
      <span className="text-ink-3 text-[11px]">{note}</span>
    </div>
  );
}

function ChangeChip({ current, previous }: { current: number; previous: number }) {
  const change = monthChange(current, previous);
  if (!change) return null;
  return (
    <span
      className={cn(
        "rounded-[999px] px-2 py-0.5 text-[11.5px] whitespace-nowrap",
        change.direction === "flat" ? "bg-sunken text-ink-2" : change.direction === "up" ? "bg-admit-soft text-admit" : "bg-refuse-soft text-refuse"
      )}
    >
      {change.label}
    </span>
  );
}

function Tiles({ data }: { data: Revenue }) {
  const { counts, collected } = data;
  return (
    <section aria-label="Headline figures" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Tile label="MRR" value={formatPaiseRounded(data.mrr_paise)} note="Yearly plans at a twelfth · free plans count ₹0" icon={<IndianRupeeIcon className="size-4" />} accent />
      <Tile label="ARR" value={formatPaiseRounded(data.arr_paise)} note="MRR × 12" icon={<TrendingUpIcon className="size-4" />} />
      <Tile
        label="Paying clubs"
        value={formatNumber(counts.paying)}
        note={`${formatNumber(counts.free_clubs)} of ${formatNumber(counts.total_clubs)} clubs are on Free`}
        icon={<UsersIcon className="size-4" />}
      />
      <Tile label="On trial" value={formatNumber(counts.trialing)} note="Not paying yet" icon={<SparklesIcon className="size-4" />} />
      <Tile label="Free plans" value={formatNumber(counts.complimentary)} note="Given by an admin · ₹0, not revenue" icon={<GiftIcon className="size-4" />} />
      <Tile
        label="Past due / in grace"
        value={`${formatNumber(counts.past_due)} / ${formatNumber(counts.in_grace)}`}
        note="A charge failed · in grace keeps the plan on (also past due)"
        icon={<HourglassIcon className="size-4" />}
        accent={counts.past_due > 0}
      />
      <Tile
        label="Collected this month"
        value={formatPaiseRounded(collected.this_month_paise)}
        chip={<ChangeChip current={collected.this_month_paise} previous={collected.last_month_paise} />}
        note={`vs ${formatPaiseRounded(collected.last_month_paise)} last month · ${formatPaiseRounded(collected.year_to_date_paise)} this year`}
        icon={<WalletIcon className="size-4" />}
      />
      <Tile
        label="All-time collected"
        value={formatPaiseRounded(collected.all_time_paise)}
        note={collected.refunded_paise > 0 ? `${formatPaise(collected.refunded_paise)} refunded` : "Nothing refunded"}
        icon={<IndianRupeeIcon className="size-4" />}
      />
    </section>
  );
}

/** Per month: what came in and went out, and how the subscriptions moved. Newest first. */
function MonthTable({ series }: { series: Revenue["series"] }) {
  const rows = [...series].reverse();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
        <caption className="sr-only">Per month: collected, refunded, new paying clubs, trials, cancellations and free plans given</caption>
        <thead>
          <tr className="micro text-left">
            <th scope="col" className="py-2 pr-2 font-normal">Month</th>
            <th scope="col" className="py-2 pr-2 text-right font-normal">Collected</th>
            <th scope="col" className="py-2 pr-2 text-right font-normal">Refunded</th>
            <th scope="col" className="py-2 pr-2 text-right font-normal">New paying</th>
            <th scope="col" className="py-2 pr-2 text-right font-normal">Trials</th>
            <th scope="col" className="py-2 pr-2 text-right font-normal">Cancelled</th>
            <th scope="col" className="py-2 text-right font-normal">New free plans</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.month} className="border-line-soft border-t">
              <th scope="row" className="text-ink py-2 pr-2 text-left font-normal">
                {monthLabel(p.month)}
              </th>
              <td className="py-2 pr-2 text-right tabular-nums">{formatPaise(p.collected_paise)}</td>
              <td className="text-ink-2 py-2 pr-2 text-right tabular-nums">{p.refunded_paise > 0 ? `−${formatPaise(p.refunded_paise)}` : "—"}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{formatNumber(p.new_paying)}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{formatNumber(p.new_trials)}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{formatNumber(p.cancelled)}</td>
              <td className="py-2 text-right tabular-nums">{formatNumber(p.new_complimentary)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ByPlan({ data }: { data: Revenue }) {
  const max = Math.max(1, ...data.by_plan.map((p) => p.mrr_paise));
  return (
    <Panel aria-labelledby="by-plan-title" className="flex-[1.4_1_380px]">
      <PanelTitle id="by-plan-title" aside="MRR by plan">
        By plan
      </PanelTitle>
      {data.by_plan.length === 0 ? (
        <p className="text-ink-2 m-0 text-[13px]">No club is on a plan yet.</p>
      ) : (
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="micro text-left">
              <th scope="col" className="py-1.5 pr-2 font-normal">Plan</th>
              <th scope="col" className="py-1.5 pr-2 text-right font-normal">Paying</th>
              <th scope="col" className="py-1.5 pr-2 text-right font-normal">Trial</th>
              <th scope="col" className="py-1.5 pr-2 text-right font-normal">Free</th>
              <th scope="col" className="py-1.5 text-right font-normal">MRR</th>
            </tr>
          </thead>
          <tbody>
            {data.by_plan.map((p, i) => (
              <tr key={p.plan_id ?? p.plan_key ?? i} className="border-line-soft border-t align-top">
                <th scope="row" className="py-2 pr-2 text-left font-normal">
                  <span className="text-ink block">{p.plan_name ?? p.plan_key ?? "Plan"}</span>
                  <span className="bg-sunken mt-1 block h-1.5 w-full max-w-[160px] rounded-[3px]" aria-hidden="true">
                    <span className="bg-brand block h-full rounded-[3px]" style={{ width: `${(p.mrr_paise / max) * 100}%` }} />
                  </span>
                </th>
                <td className="py-2 pr-2 text-right tabular-nums">{formatNumber(p.paying)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatNumber(p.trialing)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatNumber(p.complimentary)}</td>
                <td className="py-2 text-right tabular-nums">{formatPaiseRounded(p.mrr_paise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

function ByCycle({ data }: { data: Revenue }) {
  const rows = [
    ["Monthly", data.by_cycle.monthly],
    ["Yearly", data.by_cycle.yearly],
  ] as const;
  const max = Math.max(1, ...rows.map(([, r]) => r.mrr_paise));
  return (
    <Panel aria-labelledby="by-cycle-title" className="flex-[1_1_260px]">
      <PanelTitle id="by-cycle-title" aside="yearly at a twelfth">
        By cycle
      </PanelTitle>
      {rows.map(([label, row]) => (
        <div key={label} className="flex flex-col gap-1">
          <div className="flex justify-between gap-2 text-[13px]">
            <span>{label}</span>
            <span className="text-ink-2 tabular-nums">
              {formatNumber(row.paying)} paying · {formatPaiseRounded(row.mrr_paise)}/mo
            </span>
          </div>
          <div className="bg-sunken h-1.5 rounded-[3px]" aria-hidden="true">
            <div className="bg-brand h-full rounded-[3px]" style={{ width: `${(row.mrr_paise / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </Panel>
  );
}

function Renewals({ data }: { data: Revenue }) {
  const { next_30_days_paise, count } = data.upcoming_renewals;
  return (
    <Panel aria-labelledby="renewals-title" className="flex-[1_1_240px]">
      <PanelTitle id="renewals-title">Upcoming renewals</PanelTitle>
      <div className="flex items-center gap-3">
        <span className="bg-brand-soft text-brand grid size-10 shrink-0 place-items-center rounded-xl" aria-hidden="true">
          <CalendarClockIcon className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="text-[22px] tracking-[-0.02em] tabular-nums">{formatPaiseRounded(next_30_days_paise)}</div>
          <div className="text-ink-3 text-[12px]">
            {count === 0 ? "Nothing renews in the next 30 days" : `${formatNumber(count)} ${count === 1 ? "renewal" : "renewals"} due in the next 30 days`}
          </div>
        </div>
      </div>
      <p className="text-ink-3 m-0 text-[11.5px]">What Razorpay will try to charge; a failed charge is retried and may not land.</p>
    </Panel>
  );
}

/** The clubs' ticket money, held for them: shown so it is not mistaken for revenue, never added to it. */
function TicketSales({ data }: { data: Revenue }) {
  const sales = data.ticket_sales;
  if (!sales) return null;
  return (
    <section
      aria-labelledby="ticket-sales-title"
      className="border-line flex min-w-0 flex-col gap-2 rounded-[var(--radius-card)] border border-dashed p-[18px]"
    >
      <div className="flex items-center gap-2">
        <TicketIcon className="text-ink-3 size-4" aria-hidden="true" />
        <h3 id="ticket-sales-title" className="text-ink m-0 text-[14px] font-semibold">
          Ticket sales through MyOtherApp&apos;s account (held for clubs, not revenue)
        </h3>
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-2">
        <div>
          <div className="text-ink-3 text-[11.5px]">This month</div>
          <div className="text-[18px] tabular-nums">{formatPaiseRounded(sales.this_month_paise)}</div>
        </div>
        <div>
          <div className="text-ink-3 text-[11.5px]">All time</div>
          <div className="text-[18px] tabular-nums">{formatPaiseRounded(sales.all_time_paise)}</div>
        </div>
      </div>
      {sales.note ? <p className="text-ink-2 m-0 text-[12.5px]">{sales.note}</p> : null}
      <p className="text-ink-3 m-0 text-[11.5px]">
        Not counted in any figure above. Event payments themselves are on <Link href="/payments" className="underline-offset-2 hover:underline">Payments</Link>.
      </p>
    </section>
  );
}

function RevenueSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-[18px]">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-[112px] rounded-[var(--radius-card)]" />
        ))}
      </div>
      <Skeleton className="h-[300px] w-full rounded-[var(--radius-card)]" />
    </div>
  );
}

export function RevenuePage() {
  const canMoney = useCan("manage_money");
  const [span, setSpan] = React.useState<(typeof WINDOWS)[number]["value"]>("12");
  const revenue = useRevenue(Number(span));
  const backfill = useBackfill();
  const data = revenue.data;
  const months = React.useMemo(() => [...(data?.series ?? [])].map((p) => p.month).reverse(), [data?.series]);

  return (
    <div className="flex flex-col gap-[18px]">
      <header className="flex flex-wrap items-end gap-3.5">
        <div className="flex-1 basis-[300px]">
          <h2 className="m-0 text-[32px] leading-[1.12] tracking-[-0.015em]">Revenue</h2>
          <span className="text-ink-3 text-[13px]">What clubs pay for their plans. Free plans and ticket sales are not revenue.</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Window" value={span} onChange={setSpan} options={WINDOWS} className="min-w-[260px]" />
          {canMoney ? (
            <button type="button" className="btn btn-secondary" disabled={backfill.isPending} onClick={() => backfill.mutate()}>
              {backfill.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <RefreshCwIcon className="size-4" />} Sync from Razorpay
            </button>
          ) : null}
        </div>
      </header>

      {revenue.isError ? (
        <InlineAlert tone="destructive" title="Could not load revenue">
          {revenue.error instanceof Error ? revenue.error.message : "Try again in a moment."}
        </InlineAlert>
      ) : !data ? (
        <RevenueSkeleton />
      ) : (
        <div className={cn("flex flex-col gap-[18px]", revenue.isPlaceholderData && "opacity-60 transition-opacity")}>
          <Tiles data={data} />

          <Panel aria-labelledby="collected-title">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 id="collected-title" className="text-ink m-0 text-[14.5px] font-semibold tracking-[-0.01em]">
                Collected per month
              </h3>
              <CollectedLegend />
            </div>
            <CollectedChart series={data.series} />
            <MonthTable series={data.series} />
          </Panel>

          <div className="flex flex-wrap items-stretch gap-3.5">
            <ByPlan data={data} />
            <ByCycle data={data} />
            <Renewals data={data} />
          </div>

          <TicketSales data={data} />
        </div>
      )}

      <ChargesPanel months={months} />
    </div>
  );
}
