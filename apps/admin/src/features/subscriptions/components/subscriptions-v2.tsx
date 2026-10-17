"use client";

import * as React from "react";
import {
  CirclePauseIcon,
  HourglassIcon,
  IndianRupeeIcon,
  ShoppingCartIcon,
  SlidersHorizontalIcon,
  TableIcon,
  TrendingUpIcon,
  UsersIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { formatNumber, useListParams } from "@moa/app-kit";
import { InlineAlert, Skeleton, cn } from "@moa/ui";

import { usePlans, useSubscriptionTotals } from "../queries";
import { rupees } from "../schemas";
import { CompareTab } from "./compare-tab";
import { PlansTab } from "./plans-tab";
import { SubscribersTab } from "./subscribers-tab";

/**
 * The Subscriptions screen.
 *
 * Three tabs, kept in the URL so a link to the plan editor is a link to the
 * plan editor rather than to whichever tab happened to be open.
 */
type Tab = "subscribers" | "plans" | "compare";

const TABS: ReadonlyArray<{ key: Tab; label: string; icon: React.ReactNode }> = [
  { key: "subscribers", label: "Subscribers", icon: <UsersIcon className="size-4" /> },
  { key: "plans", label: "Plans and features", icon: <SlidersHorizontalIcon className="size-4" /> },
  { key: "compare", label: "Compare plans", icon: <TableIcon className="size-4" /> },
];

function inr(paiseValue: number): string {
  return `₹${formatNumber(Math.round(rupees(paiseValue)))}`;
}

function Kpi({
  label,
  value,
  note,
  icon,
  accent,
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    // A labelled group: the label, the figure and the note belong together,
    // and a screen reader reading "₹25,000" out of context says nothing.
    <div
      role="group"
      aria-label={label}
      className="flex flex-col gap-1 rounded-[var(--radius-card)] bg-surface px-5 py-[18px] shadow-card"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13.5px] text-ink">{label}</span>
        <span className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-brand-soft text-brand">
          {icon}
        </span>
      </div>
      <span
        className={cn(
          "text-[24px] tracking-[-0.02em]",
          accent && "text-brand"
        )}
      >
        {value}
      </span>
      <span className="text-[11px] text-ink-3">{note}</span>
    </div>
  );
}

export function SubscriptionsV2() {
  const params = useListParams();
  const totals = useSubscriptionTotals();
  const plans = usePlans();

  const tab = (params.param("tab") ?? "subscribers") as Tab;

  const data = totals.data;
  const noPlans = !plans.isPending && (plans.data ?? []).length === 0;

  return (
    <div className="flex flex-col gap-[18px]">
      <header className="flex flex-wrap items-end gap-3.5">
        <div className="flex-1 basis-[300px]">
          <h2 className="m-0 text-[32px] leading-[1.12] tracking-[-0.015em]">
            Subscriptions
          </h2>
          <span className="text-[13px] text-ink-3">
            Club plans, what they are billed and what each one unlocks
          </span>
        </div>
      </header>

      {noPlans ? (
        /*
         * Said plainly, because the consequence is invisible otherwise: with
         * no plans the resolver grants every club everything, which is how
         * the platform behaved before this domain existed. That is deliberate
         * -- it means shipping this did not lock anyone out -- but an admin
         * should know nothing is gated yet.
         */
        <InlineAlert tone="warning" title="Nothing is gated yet">
          No plans exist, so every club currently has unlimited access to every
          feature — the same as before plans were introduced. Create a plan with the
          key <code className="font-mono">free</code> first: it is the one clubs fall
          back to when they have no subscription of their own.
        </InlineAlert>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {totals.isPending ? (
          Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="h-[112px] rounded-[var(--radius-card)]" />
          ))
        ) : (
          <>
            <Kpi
              label="Monthly recurring"
              value={inr(data?.mrr_paise ?? 0)}
              note="Yearly plans counted at a twelfth"
              icon={<IndianRupeeIcon className="size-4" />}
              accent
            />
            <Kpi
              label="Yearly run rate"
              value={inr(data?.arr_paise ?? 0)}
              note="MRR × 12"
              icon={<TrendingUpIcon className="size-4" />}
            />
            <Kpi
              label="Paying clubs"
              value={formatNumber(data?.active_subscriptions ?? 0)}
              note={`${formatNumber(data?.trialing ?? 0)} on trial`}
              icon={<UsersIcon className="size-4" />}
            />
            <Kpi
              label="Past due"
              value={formatNumber(data?.past_due ?? 0)}
              note="Charge failed — retry or contact them"
              icon={<TriangleAlertIcon className="size-4" />}
              accent={(data?.past_due ?? 0) > 0}
            />
            <Kpi
              label="In grace"
              value={formatNumber(data?.in_grace ?? 0)}
              note="Charge failed, plan kept on until grace ends"
              icon={<HourglassIcon className="size-4" />}
              accent={(data?.in_grace ?? 0) > 0}
            />
            <Kpi
              label="Pending"
              value={formatNumber(data?.pending ?? 0)}
              note="Checkouts opened, not paid — they grant nothing"
              icon={<ShoppingCartIcon className="size-4" />}
            />
            <Kpi
              label="Paused"
              value={formatNumber(data?.paused ?? 0)}
              note="Held at Razorpay: not charged, not granted"
              icon={<CirclePauseIcon className="size-4" />}
            />
          </>
        )}
      </section>

      <div
        role="tablist"
        aria-label="Subscriptions view"
        className="inline-flex w-fit overflow-hidden rounded-[var(--radius-md)] border border-line"
      >
        {TABS.map((option, index) => {
          const active = tab === option.key;
          return (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() =>
                params.setParam("tab", option.key === "subscribers" ? undefined : option.key)
              }
              className={cn(
                "flex items-center gap-1.5 px-3 py-[7px] text-[13px] whitespace-nowrap transition-colors",
                index > 0 && "border-l border-line",
                active
                  ? "bg-brand-soft text-brand"
                  : "text-ink-2 hover:bg-sunken"
              )}
            >
              {option.icon}
              {option.label}
            </button>
          );
        })}
      </div>

      {tab === "plans" ? <PlansTab /> : null}
      {tab === "compare" ? <CompareTab /> : null}
      {tab !== "plans" && tab !== "compare" ? <SubscribersTab /> : null}
    </div>
  );
}
