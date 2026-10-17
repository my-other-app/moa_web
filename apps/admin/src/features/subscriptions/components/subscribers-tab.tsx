"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { GiftIcon, SearchIcon } from "lucide-react";
import { formatNumber } from "@moa/app-kit";
import { InlineAlert, Skeleton, StatusBadge, cn } from "@moa/ui";

import { useCan } from "@/hooks/use-can";
import { usePlans, useSubscriptions } from "../queries";
import { SUBSCRIPTION_STATUSES, STATUS_LABEL, freeBadgeText, freePlanNote, inGrace, rupees, statusLabel, type Plan, type Subscription } from "../schemas";
import { SubscriptionActions } from "./subscription-actions";

/**
 * Who is on what, and who has stopped paying.
 *
 * Ordered by MRR descending, so the subscriptions worth attention sit at the
 * top -- and a past-due club on an expensive plan is the single most urgent
 * row on the screen.
 */
const PAGE_SIZE = 25;

const GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] gap-3 md:grid-cols-[minmax(200px,1.6fr)_140px_100px_110px_150px_100px_48px]";

const WIDE_ONLY = "hidden md:block";

const STATUS_TAG: Record<string, string> = {
  // A checkout nobody has paid for yet: grants nothing, so it must not look like a customer.
  pending: "tag tag-outline",
  active: "tag tag-accent",
  trial: "tag tag-neutral",
  past_due: "tag tag-outline",
  paused: "tag tag-outline",
  cancelled: "tag tag-neutral",
};

/** Rows that want an admin's eye: a failed charge, a grace period running, or Razorpay holding the subscription. */
const ATTENTION = new Set(["past_due", "paused"]);
const needsAttention = (row: Subscription) => ATTENTION.has(row.status) || inGrace(row);

function inr(paiseValue: number): string {
  return `₹${formatNumber(Math.round(rupees(paiseValue)))}`;
}

/** What the row earns: a trial earns nothing yet, a pending checkout nothing at all, a free plan nothing ever. */
function mrrText(row: Subscription): string {
  if (row.complimentary) return "Free";
  if (row.status === "trial") return "Trial";
  if (row.status === "pending") return "—";
  return inr(row.mrr_paise);
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

/** "Free · until 31 Mar 2027": a plan an admin gave, with why and by whom on hover. */
export function FreeBadge({ row }: { row: Subscription }) {
  const text = freeBadgeText(row);
  if (!text) return null;
  const note = freePlanNote(row);
  return (
    <span title={note ?? undefined}>
      <StatusBadge label={text} tone="info" />
    </span>
  );
}

export function SubscribersTab() {
  const canMoney = useCan("manage_money");
  const plans = usePlans();
  // A notification links here with ?q=<club>, so the row it is about is the one shown.
  const linked = useSearchParams().get("q") ?? "";

  const [status, setStatus] = React.useState<string>("");
  // Only the plans an admin gave free.
  const [freeOnly, setFreeOnly] = React.useState(false);
  const [search, setSearch] = React.useState(linked);
  const [committed, setCommitted] = React.useState(linked);
  const [page, setPage] = React.useState(0);
  // Following another notification here changes ?q=; the search follows it.
  const [seen, setSeen] = React.useState(linked);
  if (seen !== linked) {
    setSeen(linked);
    setSearch(linked);
    setCommitted(linked);
    setPage(0);
  }

  const { data, isPending, isError, error, isPlaceholderData } = useSubscriptions({
    status: status || undefined,
    search: committed || undefined,
    complimentary: freeOnly ? true : undefined,
    offset: page * PAGE_SIZE,
    limit: PAGE_SIZE,
  });

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const statuses: ReadonlyArray<{ key: string; label: string }> = [
    { key: "", label: "All" },
    ...SUBSCRIPTION_STATUSES.map((key) => ({ key, label: STATUS_LABEL[key] })),
  ];

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap gap-3.5">
        <PlanMix plans={plans.data ?? []} rows={rows} />

        <div className="flex min-w-0 flex-1 basis-[320px] flex-col gap-2.5 rounded-[var(--radius-card)] bg-surface p-[18px] shadow-card">
          <span className="text-[17px]">Needs attention</span>
          {rows.filter(needsAttention).length === 0 ? (
            <span className="text-[13px] text-ink-3">
              Every charge has gone through. Nothing to chase.
            </span>
          ) : (
            rows
              .filter(needsAttention)
              .slice(0, 5)
              .map((row) => (
                <div key={row.id} className="flex items-center gap-2.5 py-1 text-[13px]">
                  <span className="min-w-0 flex-1 truncate">{row.club?.name ?? "—"}</span>
                  <span className="shrink-0 truncate text-[12px] text-ink-3">
                    {/* Razorpay's own words. A generic "payment failed" would
                        send the admin to Razorpay to find out why. */}
                    {row.status === "paused"
                      ? "Paused at Razorpay"
                      : inGrace(row)
                        ? `Grace until ${renewsText(row.grace_ends_at)}${row.last_failure_reason ? ` · ${row.last_failure_reason}` : ""}`
                        : row.last_failure_reason || "Charge failed"}
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

        <span aria-hidden="true" className="bg-line mx-1 h-5 w-px" />
        <button
          type="button"
          aria-pressed={freeOnly}
          onClick={() => {
            setFreeOnly(!freeOnly);
            setPage(0);
          }}
          className={cn(
            "flex items-center gap-1.5 rounded-[999px] border px-3 py-1.5 text-[12.5px] whitespace-nowrap transition-colors",
            freeOnly ? "border-brand bg-brand-soft text-brand" : "border-line text-ink-2 hover:text-ink"
          )}
        >
          <GiftIcon className="size-3.5" aria-hidden="true" /> Free plans
        </button>

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
                          {row.plan?.name ?? "No plan"} · {statusLabel(row.status)} ·{" "}
                          {mrrText(row)}
                        </span>
                        {row.complimentary ? (
                          <span className="md:hidden">
                            <FreeBadge row={row} />
                          </span>
                        ) : null}
                      </span>

                      {/* The plan is changed from the row's actions (Change plan), with a
                          reason and a confirmation -- not a dropdown that moved a club the
                          moment it was touched. */}
                      <span className={WIDE_ONLY}>
                        <span className="text-[13px]">{row.plan?.name ?? "—"}</span>
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
                      <span className={cn(WIDE_ONLY, "flex flex-col items-start gap-0.5")}>
                        <span className={STATUS_TAG[row.status] ?? "tag tag-neutral"}>
                          {statusLabel(row.status)}
                        </span>
                        <FreeBadge row={row} />
                        {inGrace(row) ? (
                          <StatusBadge label={`Grace until ${renewsText(row.grace_ends_at)}`} tone="warning" />
                        ) : null}
                        {row.cancel_at_period_end && row.status !== "cancelled" ? (
                          <span className="text-[11px] text-ink-3">
                            Cancels {renewsText(row.current_period_end)}
                          </span>
                        ) : row.status === "pending" && row.checkout_expires_at ? (
                          <span className="text-[11px] text-ink-3">
                            Checkout until {renewsText(row.checkout_expires_at)}
                          </span>
                        ) : null}
                      </span>
                      <span className={cn(WIDE_ONLY, "text-right")}>
                        {mrrText(row)}
                      </span>

                      <span className="flex justify-end">
                        {/* Money is the owner's: support and viewers see the row, not its actions. */}
                        {canMoney ? <SubscriptionActions row={row} /> : null}
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
            {status || committed || freeOnly ? "No subscriptions match" : "No club is on a plan yet"}
          </span>
          <span className="text-[13px] text-ink-2">
            {status || committed || freeOnly
              ? "Clear the filters to see the rest."
              : "Create a plan on the Plans tab, then give it to a club or let them subscribe."}
          </span>
        </div>
      ) : null}
    </div>
  );
}
