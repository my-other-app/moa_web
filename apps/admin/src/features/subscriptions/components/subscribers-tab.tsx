"use client";

import * as React from "react";
import { Loader2Icon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { formatNumber } from "@moa/app-kit";
import { InlineAlert, Skeleton, cn } from "@moa/ui";

import { useCan } from "@/hooks/use-can";
import {
  usePlans,
  useRetryCharge,
  useSubscriptions,
  useAssignPlan,
} from "../queries";
import { rupees, type Plan, type Subscription } from "../schemas";

/**
 * Who is on what, and who has stopped paying.
 *
 * Ordered by MRR descending, so the subscriptions worth attention sit at the
 * top -- and a past-due club on an expensive plan is the single most urgent
 * row on the screen.
 */
const PAGE_SIZE = 25;

const GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] gap-3 md:grid-cols-[minmax(200px,1.6fr)_140px_100px_120px_110px_100px_170px]";

const WIDE_ONLY = "hidden md:block";

const STATUS_TAG: Record<string, string> = {
  active: "tag tag-accent",
  trial: "tag tag-neutral",
  past_due: "tag tag-outline",
  cancelled: "tag tag-neutral",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  trial: "Trial",
  past_due: "Past due",
  cancelled: "Cancelled",
};

function inr(paiseValue: number): string {
  return `₹${formatNumber(Math.round(rupees(paiseValue)))}`;
}

function renewsText(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** The proportion of clubs on each plan, and what each contributes. */
function PlanMix({ plans, rows }: { plans: Plan[]; rows: Subscription[] }) {
  const byPlan = plans
    .map((plan) => {
      const mine = rows.filter((row) => row.plan?.id === plan.id);
      return {
        plan,
        count: mine.length,
        mrr: mine.reduce((total, row) => total + row.mrr_paise, 0),
      };
    })
    .filter((entry) => entry.count > 0);

  if (byPlan.length === 0) return null;

  // Cheapest plan gets the quietest colour, so the bar reads as a ramp from
  // free to flagship rather than an arbitrary palette.
  const tone = (index: number) =>
    [
      "bg-ink-3",
      "bg-brand/60",
      "bg-brand",
      "bg-brand",
    ][Math.min(index, 3)]!;

  return (
    <div className="flex min-w-0 flex-1 basis-[320px] flex-col gap-3 rounded-[var(--radius-card)] bg-surface p-[18px] shadow-card">
      <span className="text-[17px]">Plan mix</span>
      <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-[7px]">
        {byPlan.map((entry, index) => (
          <div
            key={entry.plan.id}
            title={`${entry.plan.name}: ${entry.count}`}
            style={{ flex: entry.count }}
            className={tone(index)}
          />
        ))}
      </div>
      {byPlan.map((entry, index) => (
        <div key={entry.plan.id} className="flex justify-between gap-2 text-[13px]">
          <span className="flex min-w-0 items-center gap-2">
            <span className={cn("size-2.5 shrink-0 rounded-[2px]", tone(index))} />
            <span className="truncate">{entry.plan.name}</span>
          </span>
          <span className="shrink-0 text-ink-2">
            {entry.count} {entry.count === 1 ? "club" : "clubs"} · {inr(entry.mrr)}/mo
          </span>
        </div>
      ))}
    </div>
  );
}

export function SubscribersTab() {
  const canMoney = useCan("manage_money");
  const plans = usePlans();
  const retry = useRetryCharge();
  const assign = useAssignPlan();

  const [status, setStatus] = React.useState<string>("");
  const [search, setSearch] = React.useState("");
  const [committed, setCommitted] = React.useState("");
  const [page, setPage] = React.useState(0);

  const { data, isPending, isError, error, isPlaceholderData } = useSubscriptions({
    status: status || undefined,
    search: committed || undefined,
    offset: page * PAGE_SIZE,
    limit: PAGE_SIZE,
  });

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const statuses: ReadonlyArray<{ key: string; label: string }> = [
    { key: "", label: "All" },
    { key: "active", label: "Active" },
    { key: "trial", label: "Trial" },
    { key: "past_due", label: "Past due" },
    { key: "cancelled", label: "Cancelled" },
  ];

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap gap-3.5">
        <PlanMix plans={plans.data ?? []} rows={rows} />

        <div className="flex min-w-0 flex-1 basis-[320px] flex-col gap-2.5 rounded-[var(--radius-card)] bg-surface p-[18px] shadow-card">
          <span className="text-[17px]">Needs attention</span>
          {rows.filter((row) => row.status === "past_due").length === 0 ? (
            <span className="text-[13px] text-ink-3">
              Every charge has gone through. Nothing to chase.
            </span>
          ) : (
            rows
              .filter((row) => row.status === "past_due")
              .slice(0, 5)
              .map((row) => (
                <div key={row.id} className="flex items-center gap-2.5 py-1 text-[13px]">
                  <span className="min-w-0 flex-1 truncate">{row.club?.name ?? "—"}</span>
                  <span className="shrink-0 truncate text-[12px] text-ink-3">
                    {/* Razorpay's own words. A generic "payment failed" would
                        send the admin to Razorpay to find out why. */}
                    {row.last_failure_reason || "Charge failed"}
                  </span>
                  <span className="shrink-0 text-brand">
                    {inr(row.mrr_paise)}
                  </span>
                </div>
              ))
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {statuses.map((option) => {
          const active = status === option.key;
          return (
            <button
              key={option.key || "all"}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setStatus(option.key);
                setPage(0);
              }}
              className={cn(
                "rounded-[999px] border px-3 py-1.5 text-[12.5px] whitespace-nowrap transition-colors",
                active
                  ? "border-brand bg-brand-soft text-brand"
                  : "border-line text-ink-2 hover:text-ink"
              )}
            >
              {option.label}
            </button>
          );
        })}

        <div className="relative ml-auto max-w-[280px] min-w-[200px] flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-[11px] size-4 -translate-y-1/2 text-ink-3" />
          <input
            className="input pl-8"
            type="search"
            aria-label="Search clubs"
            placeholder="Club name"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onBlur={() => {
              setCommitted(search);
              setPage(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                setCommitted(search);
                setPage(0);
              }
            }}
          />
        </div>
      </div>

      {isError ? (
        <InlineAlert tone="destructive" title="Could not load subscriptions">
          {error instanceof Error ? error.message : "Try again in a moment."}
        </InlineAlert>
      ) : null}

      {!isError && (isPending || rows.length > 0) ? (
        <>
          <div className="overflow-x-auto">
            <div
              className={cn(
                "flex flex-col md:min-w-[860px]",
                isPlaceholderData && "opacity-60 transition-opacity"
              )}
            >
              <div
                className={cn(
                  GRID,
                  "micro px-1.5 py-2.5",
                  "bg-[linear-gradient(to_right,transparent,var(--line)_48px,var(--line)_calc(100%-48px),transparent)] bg-[length:100%_1px] bg-bottom bg-no-repeat"
                )}
              >
                <span>Club</span>
                <span className={WIDE_ONLY}>Plan</span>
                <span className={WIDE_ONLY}>Billing</span>
                <span className={WIDE_ONLY}>Renews</span>
                <span className={WIDE_ONLY}>Status</span>
                <span className={cn(WIDE_ONLY, "text-right")}>MRR</span>
                <span className="text-right" />
              </div>

              {isPending
                ? Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className={cn(GRID, "rule-fade items-center px-1.5 py-2.5")}>
                      <Skeleton className="h-3.5 w-40" />
                      <Skeleton className={cn(WIDE_ONLY, "h-8 w-32")} />
                      <Skeleton className={cn(WIDE_ONLY, "h-3.5 w-16")} />
                      <Skeleton className={cn(WIDE_ONLY, "h-3.5 w-16")} />
                      <Skeleton className={cn(WIDE_ONLY, "h-4 w-16")} />
                      <Skeleton className={cn(WIDE_ONLY, "ml-auto h-3.5 w-14")} />
                      <Skeleton className="ml-auto h-3.5 w-10" />
                    </div>
                  ))
                : rows.map((row) => (
                    <div
                      key={row.id}
                      className={cn(GRID, "rule-fade items-center px-1.5 py-2.5 text-[13.5px]")}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{row.club?.name ?? "—"}</span>
                        <span className="flex items-center gap-1.5 truncate text-[11.5px] text-ink-3 md:hidden">
                          {row.plan?.name ?? "No plan"} · {STATUS_LABEL[row.status]} ·{" "}
                          {inr(row.mrr_paise)}
                        </span>
                      </span>

                      <span className={WIDE_ONLY}>
                        {canMoney && row.club ? (
                          <select
                            className="input min-h-8 text-[12.5px]"
                            aria-label={`Plan for ${row.club.name}`}
                            value={row.plan?.id ?? ""}
                            disabled={assign.isPending}
                            onChange={(event) =>
                              assign.mutate({
                                clubId: row.club!.id,
                                planId: Number(event.target.value),
                                cycle: row.cycle,
                              })
                            }
                          >
                            {(plans.data ?? []).map((plan) => (
                              <option key={plan.id} value={plan.id}>
                                {plan.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-[13px]">{row.plan?.name ?? "—"}</span>
                        )}
                      </span>

                      <span
                        className={cn(WIDE_ONLY, "text-[12.5px] capitalize text-ink-2")}
                      >
                        {row.cycle}
                      </span>
                      <span
                        className={cn(WIDE_ONLY, "text-[12.5px] text-ink-2")}
                      >
                        {renewsText(row.current_period_end)}
                      </span>
                      <span className={WIDE_ONLY}>
                        <span className={STATUS_TAG[row.status] ?? "tag tag-neutral"}>
                          {STATUS_LABEL[row.status] ?? row.status}
                        </span>
                      </span>
                      <span className={cn(WIDE_ONLY, "text-right")}>
                        {row.status === "trial" ? "Trial" : inr(row.mrr_paise)}
                      </span>

                      <span className="flex justify-end">
                        {row.status === "past_due" && canMoney && row.razorpay_subscription_id ? (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={retry.isPending}
                            onClick={() => retry.mutate(row.id)}
                          >
                            {retry.isPending ? (
                              <Loader2Icon className="size-3.5 animate-spin" />
                            ) : (
                              <RefreshCwIcon className="size-3.5" />
                            )}
                            Retry charge
                          </button>
                        ) : null}
                      </span>
                    </div>
                  ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <span className="text-[12.5px] text-ink-2">
              {isPending
                ? " "
                : `Page ${page + 1} of ${pages} · ${formatNumber(total)} ${total === 1 ? "subscription" : "subscriptions"}`}
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={page + 1 >= pages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      ) : null}

      {!isPending && !isError && rows.length === 0 ? (
        <div className="flex flex-col items-start gap-2 py-8">
          <span className="text-[16px]">
            {status || committed ? "No subscriptions match" : "No club is on a plan yet"}
          </span>
          <span className="text-[13px] text-ink-2">
            {status || committed
              ? "Clear the filters to see the rest."
              : "Create a plan on the Plans tab, then move a club onto it or let them subscribe."}
          </span>
        </div>
      ) : null}
    </div>
  );
}
